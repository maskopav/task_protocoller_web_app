#!/usr/bin/env node
// scripts/benchmarkProcessingPipelineBrowser.mjs
//
// Times resampling and FLAC encoding SEPARATELY, using the real production
// code paths (resampleTo44100() and encodeFlacBlob()) in a real Chromium
// instance against the real Vite dev server -- same infrastructure as
// verifyRecordingPipelineBrowser.mjs, but for timing instead of correctness.
//
// This exists to answer a concrete question: on a participant's device that
// took ~50s to process one recording, how much of that was resampling vs
// FLAC encoding? Absolute numbers here are this dev machine's CPU, not the
// slow device's -- but the RATIO between the two stages should transfer
// reasonably well, since both are real WASM compute scaling with sample
// count, and that ratio is what decides which stage is worth cutting first.
//
// Usage: run `npm run dev` in one terminal, then in another:
//   node scripts/benchmarkProcessingPipelineBrowser.mjs [devServerUrl]

import { chromium } from '@playwright/test';

const url = process.argv[2] || 'https://localhost:5173/';

// Representative recording lengths actually used in this protocol:
// MicCheck's own recording (CONFIG.RECORDING_DURATION in MicCheck.jsx), and
// two longer task lengths to see how cost scales with duration.
const DURATIONS_SEC = [12, 30, 60];
const NATIVE_RATE = 48000; // typical Android capture rate (see resampleAudio.js)

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'load' });

  console.log('Waiting for the FLAC WASM engine to become ready...');
  await page.waitForFunction(() => !!window.Flac, { timeout: 15000 });
  await page.evaluate(() => new Promise((resolve) => {
    if (window.Flac.isReady()) return resolve();
    window.Flac.onready = () => resolve();
    setTimeout(resolve, 15000);
  }));

  // Warm-up pass: excluded from the reported numbers. The WASM module needs
  // one cold compile+instantiate per engine per page load -- without a
  // warm-up, the FIRST duration's numbers would include that one-time cost
  // and misrepresent per-recording steady-state time (what a participant
  // actually experiences on their 2nd+ task, and often their 1st too, since
  // dynamic-import caching plus flacEncoder's module-level runtimePromise
  // both persist for the rest of the session after the first recording).
  console.log('\nWarm-up pass (compiling/instantiating both WASM engines, not counted)...');
  await page.evaluate(async (nativeRate) => {
    const { resampleTo44100 } = await import('/src/utils/resampleAudio.js');
    const { encodeFlacBlob } = await import('/src/utils/flacEncoder.js');
    const n = nativeRate * 1;
    const int16 = new Int16Array(n);
    for (let i = 0; i < n; i++) int16[i] = (Math.sin(i) * 1000) | 0;
    const { samples, sampleRate } = await resampleTo44100(int16, nativeRate);
    await encodeFlacBlob(samples, sampleRate);
  }, NATIVE_RATE);

  const results = [];
  for (const durationSec of DURATIONS_SEC) {
    console.log(`\nRunning ${durationSec}s recording (${NATIVE_RATE}Hz native)...`);
    const result = await page.evaluate(async ({ durationSec, nativeRate }) => {
      const { resampleTo44100 } = await import('/src/utils/resampleAudio.js');
      const { encodeFlacBlob } = await import('/src/utils/flacEncoder.js');

      // Speech-like synthetic signal (fundamental + harmonics + syllable
      // envelope), same shape as the Node-side FLAC benchmark script, so FLAC
      // sees realistic (not pure-tone / not silence) entropy to compress.
      const n = Math.round(nativeRate * durationSec);
      const int16 = new Int16Array(n);
      const f0 = 140;
      for (let i = 0; i < n; i++) {
        const t = i / nativeRate;
        const syllableEnv = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t);
        let voice = 0;
        for (let h = 1; h <= 6; h++) voice += (1 / h) * Math.sin(2 * Math.PI * f0 * h * t);
        const s = Math.max(-1, Math.min(1, syllableEnv * 0.35 * voice));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const t0 = performance.now();
      const { samples, sampleRate } = await resampleTo44100(int16, nativeRate);
      const t1 = performance.now();
      const blob = await encodeFlacBlob(samples, sampleRate);
      const t2 = performance.now();

      return {
        resampleMs: t1 - t0,
        flacEncodeMs: t2 - t1,
        totalMs: t2 - t0,
        inputSamples: n,
        outputSamples: samples.length,
        flacBytes: blob.size,
      };
    }, { durationSec, nativeRate: NATIVE_RATE });

    results.push({ durationSec, ...result });
    console.log(
      `  resample: ${result.resampleMs.toFixed(0)}ms  |  flac encode: ${result.flacEncodeMs.toFixed(0)}ms  |  total: ${result.totalMs.toFixed(0)}ms`
    );
  }

  console.log('\n--- Summary (this dev machine, real Chromium + real WASM) ---');
  console.log('duration | resample | flac encode | total | flac share of total');
  for (const r of results) {
    const flacShare = (100 * r.flacEncodeMs / r.totalMs).toFixed(0);
    console.log(
      `${String(r.durationSec).padStart(6)}s  | ${r.resampleMs.toFixed(0).padStart(7)}ms | ${r.flacEncodeMs.toFixed(0).padStart(10)}ms | ${r.totalMs.toFixed(0).padStart(6)}ms | ${flacShare}%`
    );
  }

  if (consoleErrors.length) {
    console.log('\n--- Console/page errors seen during the run ---');
    consoleErrors.forEach((e) => console.log(' -', e));
  }

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
