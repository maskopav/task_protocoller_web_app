import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { encodeFlac } from './flacEncoder';

// encodeFlac() is a pure function of (flacInstance, samples, sampleRate) --
// it doesn't care how the caller obtained the engine, so tests load it the
// Node-compatible way (libflacjs's CJS factory) rather than the browser
// <script src="/flac/..."> path used in index.html. That path loads a
// global `window.Flac`, which doesn't exist outside a real browser; this
// exercises the exact same raw Flac.* calls either way (see flacEncoder.js
// for why encodeFlac() talks to those directly instead of importing
// libflacjs's own Encoder wrapper class).
//
// Uses the 'min' (asmjs) build, not 'min wasm': under this Node version the
// wasm variant's loader calls fetch() on a raw filesystem path and throws
// "unknown scheme" -- a real bug in libflacjs's Node-environment detection
// (see scripts/benchmarkFlacCompression.mjs). It doesn't affect the
// browser, which this test doesn't exercise -- only the FLAC bitstream
// logic, which is identical between the two builds.
const require = createRequire(import.meta.url);

let flac;

beforeAll(async () => {
  const Flac = require('libflacjs')('min');
  flac = await new Promise((resolve) => { Flac.onready = () => resolve(Flac); });
}, 20000);

function decodeFlac(flacBytes) {
  const { Decoder } = require('libflacjs/lib/decoder');
  const decoder = new Decoder(flac, {});
  decoder.decode(flacBytes);
  const channels = decoder.getSamples();
  decoder.destroy();
  const bytes = channels[0];
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function sine(freq, sampleRate, durationSec, amplitude = 0.6) {
  const n = Math.round(sampleRate * durationSec);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

describe('encodeFlac', () => {
  it('starts with the FLAC stream magic bytes', () => {
    const bytes = encodeFlac(flac, sine(440, 44100, 0.2), 44100);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('fLaC');
  });

  it('round-trips to bit-exact PCM (proves it is actually lossless, not just labeled that way)', () => {
    const input = sine(440, 44100, 0.5);
    const flacBytes = encodeFlac(flac, input, 44100);
    const decoded = decodeFlac(flacBytes);

    expect(decoded.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(decoded[i]).toBe(input[i]);
    }
  });

  it('round-trips silence correctly (a degenerate but real case: pauses in a recording)', () => {
    const input = new Int16Array(44100); // 1s of digital silence
    const flacBytes = encodeFlac(flac, input, 44100);
    const decoded = decodeFlac(flacBytes);

    expect(decoded.length).toBe(input.length);
    expect(decoded.every((s) => s === 0)).toBe(true);
    // Silence is the best case for compression -- sanity-check it actually compressed.
    expect(flacBytes.length).toBeLessThan(input.length * 2 * 0.1);
  });

  it('produces output smaller than the equivalent WAV for a realistic tone', () => {
    const input = sine(220, 44100, 3);
    const flacBytes = encodeFlac(flac, input, 44100);
    const wavDataSize = input.length * 2; // 16-bit mono PCM, ignoring the 44-byte header
    expect(flacBytes.length).toBeLessThan(wavDataSize);
  });
});
