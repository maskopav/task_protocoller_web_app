#!/usr/bin/env node
// scripts/verifyResampleSpectrum.mjs
//
// Spectral verification for resampleAudio.js — runs the ACTUAL production
// resampleTo44100() (not a reimplementation) against three standard DSP test
// signals and writes their before/after spectra to JSON for plotting:
//
//   1. White noise -> Welch PSD estimate. The before/after ratio IS the
//      filter's measured magnitude response (cutoff position + stopband
//      attenuation), because noise excites every frequency at once.
//   2. Linear chirp (20Hz -> 24kHz) -> STFT spectrogram. The textbook visual
//      check for aliasing: a correct filter makes the sweep line fade out
//      cleanly at the new Nyquist; a broken one produces a second, mirrored
//      sweep line folding back down from it.
//   3. Multi-tone (1k/8k/20k/23.5kHz) -> single-window magnitude spectrum,
//      mirrors the RMS-based unit tests but shows the full spectral picture
//      instead of one scalar per tone.
//
// Usage: node scripts/verifyResampleSpectrum.mjs
//   Writes scripts/spectrum-data.json (raw data, gitignored) and
//   scripts/report.html (the same data spliced into report.template.html --
//   open it directly in a browser, or re-publish it as an artifact).

import { writeFileSync, readFileSync } from 'node:fs';
import { resampleTo44100 } from '../src/utils/resampleAudio.js';

const NATIVE_RATE = 48000;

// ── Signal generators ────────────────────────────────────────────────────
function toInt16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function whiteNoise(durationSec, amplitude = 0.5, seed = 1234) {
  // Deterministic PRNG (mulberry32) so the report is reproducible run-to-run.
  let a = seed;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = Math.round(NATIVE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * (rand() * 2 - 1);
  return toInt16(out);
}

function chirp(durationSec, f0, f1) {
  const n = Math.round(NATIVE_RATE * durationSec);
  const out = new Float32Array(n);
  const k = (f1 - f0) / durationSec; // linear sweep rate
  for (let i = 0; i < n; i++) {
    const t = i / NATIVE_RATE;
    const phase = 2 * Math.PI * (f0 * t + (k * t * t) / 2);
    out[i] = 0.8 * Math.sin(phase);
  }
  return toInt16(out);
}

function multiTone(durationSec, freqs, amplitude = 0.2) {
  const n = Math.round(NATIVE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const f of freqs) s += amplitude * Math.sin((2 * Math.PI * f * i) / NATIVE_RATE);
    out[i] = s;
  }
  return toInt16(out);
}

// ── Minimal iterative radix-2 FFT (in-place, complex) ───────────────────
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe; im[i + j + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        const nIm = curRe * wIm + curIm * wRe;
        curRe = nRe; curIm = nIm;
      }
    }
  }
}

function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// magnitude spectrum (dB) of one windowed frame, zero-padded to fftSize
function magnitudeSpectrumDb(int16Samples, fftSize) {
  const n = int16Samples.length;
  const win = hann(n);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  let winSum = 0;
  for (let i = 0; i < n; i++) { re[i] = (int16Samples[i] / 32768) * win[i]; winSum += win[i]; }
  fft(re, im);
  const half = fftSize / 2;
  const mags = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (winSum / 2);
    mags[i] = 20 * Math.log10(Math.max(mag, 1e-9));
  }
  return mags;
}

// Welch PSD estimate (dB): average power over overlapping Hann-windowed segments
function welchPsdDb(int16Samples, segLen, hop) {
  const win = hann(segLen);
  const winPower = win.reduce((s, w) => s + w * w, 0);
  const half = segLen / 2;
  const acc = new Float64Array(half);
  let frames = 0;
  for (let start = 0; start + segLen <= int16Samples.length; start += hop) {
    const re = new Float64Array(segLen);
    const im = new Float64Array(segLen);
    for (let i = 0; i < segLen; i++) re[i] = (int16Samples[start + i] / 32768) * win[i];
    fft(re, im);
    for (let i = 0; i < half; i++) acc[i] += (re[i] * re[i] + im[i] * im[i]) / winPower;
    frames++;
  }
  const out = new Float64Array(half);
  for (let i = 0; i < half; i++) out[i] = 10 * Math.log10(Math.max(acc[i] / frames, 1e-12));
  return out;
}

// Bucket-mean: right for a broadband/flat spectrum (noise floor, rolloff
// shape) where no single bin matters more than its neighbors.
function downsampleArrayMean(arr, targetLen) {
  if (arr.length <= targetLen) return Array.from(arr);
  const out = new Array(targetLen);
  const bucket = arr.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * bucket), end = Math.floor((i + 1) * bucket);
    let sum = 0;
    for (let j = start; j < end; j++) sum += arr[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

// Bucket-max: required for narrow-band content (a pure tone's spectral
// peak). Averaging dB values here would be wrong -- a peak occupying 1-2
// bins out of a ~32-bin bucket gets swamped by the ~30 silent neighbors and
// disappears into the noise floor. Max-pooling is the standard peak-
// preserving decimation used by waveform/spectrum viewers for this reason.
function downsampleArrayMax(arr, targetLen) {
  if (arr.length <= targetLen) return Array.from(arr);
  const out = new Array(targetLen);
  const bucket = arr.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * bucket), end = Math.floor((i + 1) * bucket);
    let m = -Infinity;
    for (let j = start; j < end; j++) if (arr[j] > m) m = arr[j];
    out[i] = m;
  }
  return out;
}

// Round to 1 decimal (dB) — plotting doesn't need more, and it roughly
// triples-halves the JSON text size vs full float64 precision.
const round1 = (x) => Math.round(x * 10) / 10;

function spectrogramDb(int16Samples, sampleRate, winLen, hop, freqBins) {
  const win = hann(winLen);
  const frames = [];
  for (let start = 0; start + winLen <= int16Samples.length; start += hop) {
    const re = new Float64Array(winLen);
    const im = new Float64Array(winLen);
    for (let i = 0; i < winLen; i++) re[i] = (int16Samples[start + i] / 32768) * win[i];
    fft(re, im);
    const half = winLen / 2;
    const mags = new Float64Array(half);
    for (let i = 0; i < half; i++) mags[i] = 20 * Math.log10(Math.max(Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (winLen / 4), 1e-9));
    frames.push(downsampleArrayMax(mags, freqBins).map(round1));
  }
  return { frames, freqBinHz: (sampleRate / winLen) * (winLen / 2 / freqBins), timeStepSec: hop / sampleRate };
}

async function main() {
  console.log('Generating test signals @ 48kHz...');
  const noise = whiteNoise(6);
  const sweep = chirp(3, 20, 24000);
  const tones = multiTone(1, [1000, 8000, 20000, 23500]);

  console.log('Resampling through the ACTUAL resampleTo44100()...');
  const noiseOut = await resampleTo44100(noise, NATIVE_RATE);
  const sweepOut = await resampleTo44100(sweep, NATIVE_RATE);
  const tonesOut = await resampleTo44100(tones, NATIVE_RATE);

  console.log('Computing Welch PSD (noise)...');
  const noisePsdBefore = welchPsdDb(noise, 4096, 2048);
  const noisePsdAfter = welchPsdDb(noiseOut.samples, 4096, 2048);

  console.log('Computing chirp spectrograms...');
  const specBefore = spectrogramDb(sweep, NATIVE_RATE, 1024, 320, 220);
  const specAfter = spectrogramDb(sweepOut.samples, sweepOut.sampleRate, 1024, 320, 220);

  console.log('Computing multi-tone spectra...');
  const fftSize = nextPow2(tones.length);
  const toneSpecBefore = magnitudeSpectrumDb(tones, fftSize);
  const toneSpecAfter = magnitudeSpectrumDb(tonesOut.samples, fftSize);

  const report = {
    nativeRate: NATIVE_RATE,
    targetRate: noiseOut.sampleRate,
    // NOTE: downsampleArray() bucket-averages each full-resolution spectrum
    // down to a smaller array spanning the SAME 0..Nyquist range, so the
    // freqBinHz recorded here must be (Nyquist / downsampled length), not
    // the original pre-downsample bin spacing — otherwise every frequency
    // this JSON's bin index maps to would be off by ~20-30x.
    noise: {
      before: { freqBinHz: NATIVE_RATE / 2 / 512, db: downsampleArrayMean(noisePsdBefore, 512).map(round1) },
      after: { freqBinHz: noiseOut.sampleRate / 2 / 512, db: downsampleArrayMean(noisePsdAfter, 512).map(round1) },
    },
    chirp: {
      before: specBefore,
      after: specAfter,
      f0: 20, f1: 24000, durationSec: 3,
    },
    tones: {
      freqs: [1000, 8000, 20000, 23500],
      before: { freqBinHz: NATIVE_RATE / 2 / 1024, db: downsampleArrayMax(toneSpecBefore, 1024).map(round1) },
      after: { freqBinHz: tonesOut.sampleRate / 2 / 1024, db: downsampleArrayMax(toneSpecAfter, 1024).map(round1) },
    },
  };

  const dataJson = JSON.stringify(report);
  writeFileSync(new URL('./spectrum-data.json', import.meta.url), dataJson);
  console.log('Wrote scripts/spectrum-data.json (' + (dataJson.length / 1024 / 1024).toFixed(2) + ' MB)');

  const template = readFileSync(new URL('./report.template.html', import.meta.url), 'utf8');
  const marker = '/*__SPECTRUM_DATA__*/';
  if (!template.includes(marker)) {
    throw new Error('report.template.html is missing the ' + marker + ' placeholder');
  }
  const reportHtml = template.replace(marker, dataJson);
  writeFileSync(new URL('./report.html', import.meta.url), reportHtml);
  console.log('Wrote scripts/report.html (' + (reportHtml.length / 1024 / 1024).toFixed(2) + ' MB)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
