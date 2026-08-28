#!/usr/bin/env node
// scripts/verifyRecordingPipelineBrowser.mjs
//
// Drives a real Chromium instance against the real Vite dev server and runs
// the actual, unmodified finalizeRecording() -- the full resample-then-FLAC
// pipeline used by every voice recording -- end to end.
//
// This exists because unit tests alone missed a real bug: resampleAudio.js's
// import of @alexanderolsen/libsamplerate-js worked fine under vitest but
// threw "Cannot destructure property 'create' of 'LibSampleRate' as it is
// undefined" the moment it ran in an actual browser via Vite's real
// dev-server bundling -- vitest's transform handles this package's CJS/ESM
// shape differently than Vite's browser-targeted esbuild pipeline does. FLAC
// encoding hit a similar but different bundler-interop bug (see
// flacEncoder.js's header comment). Neither was visible from Node or from
// vitest; both only showed up by actually loading the page in a browser.
// This script is the regression guard for that whole class of bug -- rerun
// it after touching resampleAudio.js, flacEncoder.js, or finalizeRecording.js.
//
// Usage: run `npm run dev` in one terminal, then in another:
//   node scripts/verifyRecordingPipelineBrowser.mjs [devServerUrl]
//
// Imports `chromium` from @playwright/test (an existing devDependency)
// rather than `playwright-core` directly -- the latter only happens to be
// present via hoisting (it's a transitive dependency two levels down:
// @playwright/test -> playwright -> playwright-core) and isn't declared
// anywhere in this project, so importing it directly would be relying on
// an implementation detail that a stricter package manager or a version
// bump could break.
import { chromium } from '@playwright/test';

const url = process.argv[2] || 'https://localhost:5173/';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'load' });

  if (consoleErrors.length) {
    console.log('\n--- Errors during initial page load (before any test action) ---');
    consoleErrors.forEach((e) => console.log(' -', e));
  }

  console.log('Waiting for the FLAC WASM engine to become ready...');
  await page.waitForFunction(() => !!window.Flac, { timeout: 15000 });
  await page.evaluate(() => new Promise((resolve) => {
    if (window.Flac.isReady()) return resolve();
    window.Flac.onready = () => resolve();
    setTimeout(resolve, 15000);
  }));

  console.log('Running the real finalizeRecording() pipeline (resample 48kHz->44.1kHz, then FLAC)...');
  const result = await page.evaluate(async () => {
    const { finalizeRecording } = await import('/src/utils/finalizeRecording.js');
    const { initSession, appendChunk, clearSession } = await import('/src/utils/audioIDB.js');

    await initSession();
    await clearSession();
    await initSession();

    // 2s @ 48000Hz -- simulates a real Chrome/Android capture rate above the
    // 44.1kHz target, so this exercises BOTH the resample step and the FLAC
    // encode step, not just one of them.
    const nativeRate = 48000;
    const n = nativeRate * 2;
    const int16 = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const s = 0.5 * Math.sin((2 * Math.PI * 300 * i) / nativeRate);
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    await appendChunk(int16.buffer);

    const blob = await finalizeRecording(nativeRate);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

    return { blobType: blob.type, byteLength: bytes.length, magic };
  });

  console.log('\n--- Real browser pipeline result ---');
  console.log(JSON.stringify(result, null, 2));

  if (consoleErrors.length) {
    console.log('\n--- All console/page errors seen during the run ---');
    consoleErrors.forEach((e) => console.log(' -', e));
  }

  // A silent WAV fallback (finalizeRecording never throws by design) would
  // otherwise look like a "pass" -- explicitly require the FLAC path to have
  // actually succeeded, since that's what this script is verifying.
  const ok = consoleErrors.length === 0 && result.blobType === 'audio/flac' && result.magic === 'fLaC';
  console.log('\nVERDICT:', ok ? 'PASS -- real browser produced a valid FLAC blob, no errors' : 'FAIL');

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
