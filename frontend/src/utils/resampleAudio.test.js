import { describe, it, expect, vi } from 'vitest';
import {
  TARGET_SAMPLE_RATE,
  int16ToFloat32,
  float32ToInt16,
  resampleTo44100,
} from './resampleAudio';

function generateSineInt16(frequencyHz, sampleRate, durationSeconds, amplitude = 0.8) {
  const length = Math.round(sampleRate * durationSeconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
  }
  return float32ToInt16(out);
}

function rms(int16Samples) {
  let sumSq = 0;
  for (let i = 0; i < int16Samples.length; i++) {
    const v = int16Samples[i] / 32768;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / int16Samples.length);
}

describe('int16ToFloat32 / float32ToInt16', () => {
  it('round-trips representative values without corruption', () => {
    const original = Int16Array.from([0, 1, -1, 32767, -32768, 16000, -16000]);
    const roundTripped = float32ToInt16(int16ToFloat32(original));
    for (let i = 0; i < original.length; i++) {
      // +/-1 tolerance: int16 <-> float32 <-> int16 can round the LSB.
      expect(Math.abs(roundTripped[i] - original[i])).toBeLessThanOrEqual(1);
    }
  });

  it('clamps out-of-range float samples instead of wrapping', () => {
    const out = float32ToInt16(Float32Array.from([2, -2, 0.5]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });
});

describe('resampleTo44100', () => {
  it('is a no-op when the native rate is already at or below the target', async () => {
    const samples = Int16Array.from([1, 2, 3, 4, 5]);
    const result = await resampleTo44100(samples, 44100);
    expect(result.sampleRate).toBe(44100);
    expect(result.samples).toBe(samples); // same reference, zero-cost pass-through

    const lower = await resampleTo44100(samples, 22050);
    expect(lower.sampleRate).toBe(22050);
    expect(lower.samples).toBe(samples);
  });

  it('never upsamples', async () => {
    const samples = Int16Array.from([1, 2, 3]);
    const result = await resampleTo44100(samples, 8000);
    expect(result.sampleRate).toBe(8000);
  });

  it('handles empty input without invoking the WASM converter', async () => {
    const result = await resampleTo44100(new Int16Array(0), 48000);
    expect(result.samples.length).toBe(0);
  });

  it('downsamples 48kHz -> 44.1kHz to the expected sample count', async () => {
    const input = generateSineInt16(1000, 48000, 0.5); // 24000 samples
    const { samples, sampleRate } = await resampleTo44100(input, 48000);

    expect(sampleRate).toBe(TARGET_SAMPLE_RATE);
    const expectedLength = Math.round(input.length * (44100 / 48000));
    expect(Math.abs(samples.length - expectedLength)).toBeLessThan(Math.max(64, expectedLength * 0.02));
  }, 15000);

  it('preserves an in-band tone (no destructive filtering below the new Nyquist)', async () => {
    const input = generateSineInt16(1000, 48000, 0.3); // well below 22.05kHz Nyquist
    const { samples } = await resampleTo44100(input, 48000);

    const inputRms = rms(input);
    const outputRms = rms(samples);
    // Sinc resampling should barely touch an in-band tone's energy.
    expect(outputRms).toBeGreaterThan(inputRms * 0.8);
  }, 15000);

  it('attenuates a tone above the new Nyquist instead of letting it alias through', async () => {
    // 23.5kHz is representable at 48kHz (Nyquist 24kHz) but sits above the
    // new 22.05kHz Nyquist -- a correct anti-aliasing filter must suppress
    // it, not fold it back into the audible band.
    const input = generateSineInt16(23500, 48000, 0.3);
    const { samples } = await resampleTo44100(input, 48000);

    const inputRms = rms(input);
    const outputRms = rms(samples);
    expect(outputRms).toBeLessThan(inputRms * 0.15);
  }, 15000);

  it('resamples a full task-length recording within a generous time budget', async () => {
    const input = generateSineInt16(200, 48000, 10); // 10s, comparable to a real task
    const start = Date.now();
    const { samples } = await resampleTo44100(input, 48000);
    const elapsedMs = Date.now() - start;

    expect(samples.length).toBeGreaterThan(0);
    // Smoke-test bound, not a strict benchmark: WASM sinc resampling of a
    // few hundred thousand samples should take well under a second on any
    // CI/dev machine; this just guards against a severe regression.
    expect(elapsedMs).toBeLessThan(10000);
  }, 20000);

  it('throws instead of silently returning corrupt audio when the converter misbehaves', async () => {
    vi.resetModules();
    const brokenLib = {
      ConverterType: { SRC_SINC_BEST_QUALITY: 0 },
      create: async () => ({
        simple: () => new Float32Array(3), // absurdly short output for a large input
        destroy: () => {},
      }),
    };
    vi.doMock('@alexanderolsen/libsamplerate-js', () => ({ default: brokenLib, ...brokenLib }));

    const { resampleTo44100: resampleWithBrokenConverter } = await import('./resampleAudio');
    const input = generateSineInt16(1000, 48000, 0.5);

    await expect(resampleWithBrokenConverter(input, 48000)).rejects.toThrow(/outside expected range/);

    vi.doUnmock('@alexanderolsen/libsamplerate-js');
    vi.resetModules();
  });
});
