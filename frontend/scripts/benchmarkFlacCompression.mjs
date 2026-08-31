#!/usr/bin/env node
// scripts/benchmarkFlacCompression.mjs
//
// Measures real FLAC compression ratios across three standard reference
// signals -- a best-case pure tone, a worst-case white-noise floor, and a
// speech-like signal in between -- so "how much does this actually save"
// stays an answer backed by numbers rather than an assumption. Rerun this
// after changing the encoder's compression level or sample rate to see how
// the estimate moves. Round-trip losslessness itself is covered by
// flacEncoder.test.js; this script is about the size numbers, not correctness.
//
// libflacjs is CJS-only with a Node-specific factory (its index.js uses
// path/__dirname/fs-style require() to locate the WASM binary), so this
// uses createRequire() rather than the browser <script src> + FLAC_SCRIPT_
// LOCATION loading path the real app uses (see flacEncoder.js).
//
// Usage: node scripts/benchmarkFlacCompression.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const SAMPLE_RATE = 44100;

function toInt16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function pureTone(freq, durationSec, amplitude = 0.6) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return toInt16(out);
}

function whiteNoise(durationSec, amplitude = 0.3, seed = 42) {
  let a = seed;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * (rand() * 2 - 1);
  return toInt16(out);
}

// A crude but honest stand-in for voiced speech: a fundamental + decaying
// harmonics (vowel-like spectrum), amplitude-modulated to simulate syllable
// rhythm, with quiet stretches between syllables (pauses). Real speech
// compresses better than white noise but nowhere near as well as a pure tone,
// so this is meant to sit in a realistic middle ground for the estimate.
function speechLike(durationSec) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  const f0 = 140; // typical fundamental frequency, Hz
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const syllableEnv = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t); // ~3.5 syllables/sec
    const pause = Math.sin(2 * Math.PI * 0.3 * t) > 0.85 ? 0.02 : 1; // occasional pause
    let voice = 0;
    for (let h = 1; h <= 6; h++) voice += (1 / h) * Math.sin(2 * Math.PI * f0 * h * t);
    out[i] = pause * syllableEnv * 0.35 * voice;
  }
  return toInt16(out);
}

function waitReady(flac) {
  return new Promise((resolve) => {
    flac.onready = () => resolve(flac);
  });
}

async function encodeFlac(flac, int16Samples, sampleRate) {
  const { Encoder } = require('libflacjs/lib/encoder');
  const encoder = new Encoder(flac, {
    sampleRate,
    channels: 1,
    bitsPerSample: 16,
    compression: 5,
    verify: true,
  });
  const int32 = Int32Array.from(int16Samples);
  encoder.encode(int32);
  encoder.encode(); // finalize
  const bytes = encoder.getSamples();
  encoder.destroy();
  return bytes;
}

async function decodeFlac(flac, flacBytes) {
  const { Decoder } = require('libflacjs/lib/decoder');
  const decoder = new Decoder(flac, {});
  decoder.decode(flacBytes);
  const channels = decoder.getSamples(); // [Uint8Array] for mono
  decoder.destroy();
  const bytes = channels[0];
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function wavBytes(int16Samples) {
  return 44 + int16Samples.length * 2;
}

async function report(label, flac, int16Samples) {
  const flacBytes = await encodeFlac(flac, int16Samples, SAMPLE_RATE);
  const decoded = await decodeFlac(flac, flacBytes);

  let bitExact = decoded.length === int16Samples.length;
  let firstMismatch = -1;
  if (bitExact) {
    for (let i = 0; i < int16Samples.length; i++) {
      if (decoded[i] !== int16Samples[i]) { bitExact = false; firstMismatch = i; break; }
    }
  }

  const wav = wavBytes(int16Samples);
  const flacSize = flacBytes.length;
  const pct = (100 * (1 - flacSize / wav)).toFixed(1);

  console.log(`\n--- ${label} ---`);
  console.log(`  samples: ${int16Samples.length}  (${(int16Samples.length / SAMPLE_RATE).toFixed(1)}s @ ${SAMPLE_RATE}Hz)`);
  console.log(`  WAV size:  ${(wav / 1024).toFixed(1)} KB`);
  console.log(`  FLAC size: ${(flacSize / 1024).toFixed(1)} KB`);
  console.log(`  reduction: ${pct}%`);
  console.log(`  round-trip bit-exact: ${bitExact}${bitExact ? '' : ` (first mismatch at sample ${firstMismatch})`}`);
}

async function main() {
  console.log('Loading libflacjs...');
  // 'min' (asmjs), not 'min wasm': under this Node version the wasm variant's
  // loader calls fetch() on a raw filesystem path and throws "unknown scheme"
  // -- a real bug in libflacjs's Node-environment detection (see
  // flacEncoder.test.js for the full explanation). Doesn't affect the
  // browser or the compression numbers -- both builds produce the same
  // FLAC bitstream, this only picks which engine runs the encoding.
  const Flac = require('libflacjs')('min');
  const flac = await waitReady(Flac);
  console.log('Ready. variant =', flac.variant);

  await report('Pure tone (best case)', flac, pureTone(220, 5));
  await report('White noise (worst case)', flac, whiteNoise(5));
  await report('Speech-like (realistic estimate)', flac, speechLike(40));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
