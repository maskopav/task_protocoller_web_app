import { describe, it, expect } from 'vitest';
import { computeFrames, summarizeLevels } from './audioLevels';

const RATE = 8000;
const FRAME = RATE * 0.05; // 50 ms

const measureLevels = (samples, rate) => summarizeLevels(computeFrames(samples, rate));

function sine(amplitude, n) {
  return Array.from({ length: n }, (_, i) => Math.round(amplitude * Math.sin((2 * Math.PI * 200 * i) / RATE)));
}

// Alternating +-a around `offset`: rms of exactly a once the offset is removed.
function squareNoise(a, n, offset = 0) {
  return Array.from({ length: n }, (_, i) => offset + (i % 2 ? a : -a));
}

describe('computeFrames', () => {
  it('returns the dc-free rms of every whole frame, in time order', () => {
    const samples = Int16Array.from([...squareNoise(2, FRAME, 100), ...squareNoise(7, FRAME), 1, 2, 3]);
    const frames = computeFrames(samples, RATE);

    expect(frames.frameSec).toBe(0.05);
    expect(Array.from(frames.rms)).toEqual([2, 7]); // the 3-sample tail is dropped
    expect(frames.peak).toBe(102);
  });
});

describe('summarizeLevels', () => {
  it('measures peak and speech level in dB relative to full scale', () => {
    const levels = measureLevels(Int16Array.from(sine(16384, RATE)), RATE);

    expect(levels.peakDbfs).toBeCloseTo(-6.0, 1);         // half of full scale
    expect(levels.speechLevelDbfs).toBeCloseTo(-9.0, 1);  // sine rms = peak / sqrt(2)
    expect(levels.fullScaleSamples).toBe(0);
  });

  it('counts samples at full scale', () => {
    const levels = measureLevels(Int16Array.from([0, 32767, -32768, 32766, 100]), RATE);

    expect(levels.fullScaleSamples).toBe(2);
    expect(levels.peakDbfs).toBe(0);
  });

  it('takes the noise floor from pauses and the speech level from phonation', () => {
    // 1 s of background noise (rms 3 LSB) followed by 1 s of loud phonation.
    const samples = Int16Array.from([...squareNoise(3, RATE), ...sine(20000, RATE)]);
    const levels = measureLevels(samples, RATE);

    expect(levels.noiseFloorLsb).toBe(3);
    expect(levels.noiseFloorDbfs).toBeCloseTo(20 * Math.log10(3 / 32768), 1);
    expect(levels.snrDb).toBeCloseTo(20 * Math.log10(20000 / Math.SQRT2 / 3), 1);
  });

  it('does not count a DC offset as noise', () => {
    const levels = measureLevels(Int16Array.from(squareNoise(3, RATE, 500)), RATE);
    expect(levels.noiseFloorLsb).toBe(3);
  });

  it('measures a recording shorter than one frame as a single frame', () => {
    const levels = measureLevels(Int16Array.from(squareNoise(5, FRAME - 1)), RATE);
    expect(levels.noiseFloorLsb).toBeCloseTo(5, 1);
  });

  it('returns nulls for an empty or all-zero recording', () => {
    expect(measureLevels(new Int16Array(0), RATE)).toEqual({
      peakDbfs: null, fullScaleSamples: 0, speechLevelDbfs: null,
      noiseFloorDbfs: null, noiseFloorLsb: null, snrDb: null,
    });
    const silent = measureLevels(new Int16Array(RATE), RATE);
    expect(silent.peakDbfs).toBeNull();
    expect(silent.noiseFloorLsb).toBe(0);
    expect(silent.snrDb).toBeNull();
  });
});
