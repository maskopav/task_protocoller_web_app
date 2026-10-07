import { test, expect, type Page } from '@playwright/test';

// Verifies MicCheck's SNR end to end in a real browser: the microphone is
// replaced by a generated signal with known levels, and the SNR the app
// computes (read from its "MicCheck completed" log) must match the theory.
//
// Signal: white noise (always on, rms NOISE_RMS) plus "speech" during the
// counting phase. The test silences the speech the moment the "stay silent"
// prompt appears -- exactly what a compliant participant does.
//
// Seeded participant 2 (backend/scripts/seed/e2e_participant_seed.sql) --
// its own, so this spec doesn't change participant-flow.spec.ts's session.
const PARTICIPANT_TOKEN = 'e2e3e2e3e2e3e2e3e2e3e2e3e2e3e2e3';
const NOISE_RMS = 0.002;  // of full scale (~ -54 dBFS)
const BURST_RMS = 0.2;    // of full scale, synthetic "counting" bursts
const FULL_SCALE_LSB = 32767;
const db = (ratio: number) => 20 * Math.log10(ratio);

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

// Runs in the page before any app code: getUserMedia({ audio }) returns a
// track from a generator graph instead of the microphone.
function installFakeMic({ source, noiseRms, burstRms }: { source: 'bursts' | 'speech'; noiseRms: number; burstRms: number }) {
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  let generator: Promise<{ ctx: AudioContext; dest: MediaStreamAudioDestinationNode; speechGain: GainNode }> | null = null;

  const loop = (ctx: AudioContext, buffer: AudioBuffer, to: AudioNode) => {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.connect(to);
    node.start();
  };

  async function build() {
    const ctx = new AudioContext({ sampleRate: 48000 });
    const rate = ctx.sampleRate;
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;

    const noise = ctx.createBuffer(1, 3 * rate, rate);
    const amp = noiseRms * Math.sqrt(3);  // uniform noise: rms = amplitude / sqrt(3)
    noise.getChannelData(0).forEach((_, i, d) => { d[i] = (Math.random() * 2 - 1) * amp; });
    loop(ctx, noise, dest);

    let speech: AudioBuffer;
    if (source === 'speech') {
      const res = await fetch('/audio/illustrations/en/retelling_redRidingHood.wav');
      speech = await ctx.decodeAudioData(await res.arrayBuffer());
    } else {
      // 0.3 s 220 Hz bursts every 0.7 s
      speech = ctx.createBuffer(1, Math.round(0.7 * rate), rate);
      speech.getChannelData(0).forEach((_, i, d) => {
        d[i] = i < 0.3 * rate ? burstRms * Math.SQRT2 * Math.sin((2 * Math.PI * 220 * i) / rate) : 0;
      });
    }
    const speechGain = ctx.createGain();
    speechGain.connect(dest);
    loop(ctx, speech, speechGain);
    await ctx.resume();
    return { ctx, dest, speechGain };
  }

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints?.audio || constraints.video) return original(constraints);
    generator ??= build();
    const { dest } = await generator;
    return new MediaStream([dest.stream.getAudioTracks()[0].clone()]);
  };
  (window as any).__silenceFakeSpeech = async () => {
    const { ctx, speechGain } = await generator!;
    speechGain.gain.setValueAtTime(0, ctx.currentTime);
  };
}

// Runs one mic check and returns its "MicCheck completed" log entry.
async function runMicCheck(page: Page) {
  let resolveLog: (details: any) => void;
  const micCheckLog = new Promise<any>((resolve) => { resolveLog = resolve; });
  await page.route('**/logs/frontend', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.message?.startsWith('MicCheck completed')) resolveLog(body.details);
    await route.fulfill({ json: { success: true } });
  });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto(`/#/participant/${PARTICIPANT_TOKEN}`);
  await page.waitForURL(/#\/participant\/interface$/, { timeout: 20_000 });

  // Step through whatever comes before the mic check: a "Welcome back" dialog
  // (the seeded session resumes in later tests), the volume check, consent.
  const start = page.locator('.btn-start');
  const welcomeBack = page.getByRole('button', { name: 'Continue' });
  const volumeOption = page.getByRole('button', { name: '32', exact: true });
  const consent = page.getByText('E2E test consent text');
  for (let step = 0; step < 6 && !(await start.isVisible()); step++) {
    await Promise.race([start, welcomeBack, volumeOption, consent].map((l) => l.waitFor({ timeout: 10_000 })));
    if (await welcomeBack.isVisible()) await welcomeBack.click();
    else if (await volumeOption.isVisible()) {
      await volumeOption.click();
      await page.locator('.btn-next').click();
    } else if (await consent.isVisible()) {
      await page.locator('.btn-next').click();
    }
    await page.waitForTimeout(500);  // ParticipantInterfacePage's transition lock
  }

  await start.click({ timeout: 15_000 });
  await page.getByText('Now stay silent').waitFor({ timeout: 30_000 });
  await page.evaluate(() => (window as any).__silenceFakeSpeech());

  return micCheckLog;
}

test('mic check SNR without VAD matches the injected signal', async ({ page }) => {
  test.setTimeout(90_000);
  // VAD fails to load: MicVAD.new() rejects, as on a device where the model can't run.
  await page.addInitScript(() => {
    const stub = { MicVAD: { new: () => Promise.reject(new Error('VAD disabled by test')) } };
    Object.defineProperty(window, 'vad', { get: () => stub, set: () => {} });
  });
  await page.addInitScript(installFakeMic, { source: 'bursts', noiseRms: NOISE_RMS, burstRms: BURST_RMS });

  const { errorType, debugData } = await runMicCheck(page);
  console.log('no-VAD debugData:', debugData);

  expect(errorType).toBeNull();
  expect(debugData).toMatchObject({ usedFallback: true, usedSilencePhase: true });
  expect(Math.abs(db(debugData.noiseRms / (NOISE_RMS * FULL_SCALE_LSB)))).toBeLessThan(1);
  expect(Math.abs(db(debugData.signalRms / (Math.hypot(BURST_RMS, NOISE_RMS) * FULL_SCALE_LSB)))).toBeLessThan(1);
});

test('mic check SNR with VAD measures the silence-phase noise on real speech', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(installFakeMic, { source: 'speech', noiseRms: NOISE_RMS, burstRms: BURST_RMS });

  const { errorType, debugData } = await runMicCheck(page);
  console.log('VAD debugData:', debugData);

  expect(errorType).toBeNull();
  expect(debugData).toMatchObject({ usedFallback: false, usedSilencePhase: true });
  expect(Math.abs(db(debugData.noiseRms / (NOISE_RMS * FULL_SCALE_LSB)))).toBeLessThan(1);
  expect(debugData.signalRms / debugData.noiseRms).toBeGreaterThan(10);
});
