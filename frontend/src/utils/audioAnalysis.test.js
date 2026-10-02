import { describe, it, expect, vi } from 'vitest';
import { calculateSNR } from './audioAnalysis';
import { computeFrames } from './audioLevels';

vi.mock('./frontendLogger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), fatal: vi.fn() },
}));

// calculateSNR works on audioLevels.js's computeFrames() output: one rms value
// per 50 ms frame. Times are Date.now()-style ms; the recording starts at T0.
const FRAME_SEC = 0.05;
const T0 = 1_000_000;
const at = (sec) => T0 + sec * 1000;

// sections: [[rms, seconds], ...] in time order
function frames(sections, peak = 20000) {
  const rms = sections.flatMap(([value, sec]) => Array(Math.round(sec / FRAME_SEC)).fill(value));
  return { frameSec: FRAME_SEC, rms: Float32Array.from(rms), peak };
}

const db = (ratio) => 20 * Math.log10(ratio);

describe('calculateSNR', () => {
  it('takes speech from VAD segments and noise from the silence phase', () => {
    // 1 s wait (rms 30), 4 s counting (1000), 1 s still finishing (30), 6 s silence (10)
    const levels = frames([[30, 1], [1000, 4], [30, 1], [10, 6]]);
    const vad = [{ startTime: at(1), endTime: at(5) }];

    const result = calculateSNR(levels, vad, T0, at(5.5));

    expect(result.error).toBeNull();
    expect(result.snr).toBeCloseTo(db(1000 / 10), 1);
    expect(result.debugData).toMatchObject({ usedFallback: false, usedSilencePhase: true });
  });

  it('ignores a short loud event in the silence phase (median, not mean power)', () => {
    const levels = frames([[1000, 4], [10, 3], [5000, 0.2], [10, 3]]); // a knock mid-silence
    const result = calculateSNR(levels, [{ startTime: at(0), endTime: at(4) }], T0, at(4));

    expect(result.snr).toBeCloseTo(db(1000 / 10), 1);
  });

  it('without VAD, uses the counting phase as speech -- however long it lasts', () => {
    // counting runs to 8 s; the old fixed 0-5 s window would count 5-8 s as noise
    const levels = frames([[1000, 8], [10, 4]]);

    const result = calculateSNR(levels, [], T0, at(8));

    expect(result.snr).toBeCloseTo(db(1000 / 10), 1);
    expect(result.debugData.usedFallback).toBe(true);
  });

  it('falls back to the first 5 s as speech when there is neither VAD nor a silence prompt', () => {
    const levels = frames([[1000, 5], [10, 7]]);

    const result = calculateSNR(levels, null, T0, null);

    expect(result.snr).toBeCloseTo(db(1000 / 10), 1);
    expect(result.debugData.usedSilencePhase).toBe(false);
  });

  it('uses all non-speech frames when the recording ended before the silence phase', () => {
    const levels = frames([[10, 1], [1000, 4]]);

    const result = calculateSNR(levels, [{ startTime: at(1), endTime: at(5) }], T0, at(5.5));

    expect(result.snr).toBeCloseTo(db(1000 / 10), 1);
    expect(result.debugData.usedSilencePhase).toBe(false);
  });

  it('reports a muted mic for a near-zero peak or an empty recording', () => {
    expect(calculateSNR(frames([[0, 5]], 10), [], T0, null).error).toBe('muted');
    expect(calculateSNR({ frameSec: FRAME_SEC, rms: new Float32Array(0), peak: 0 }, [], T0, null).error).toBe('muted');
    expect(calculateSNR(undefined, [], T0, null).error).toBe('muted');
  });

  it('reports no-noise when the silence phase is digital silence', () => {
    const result = calculateSNR(frames([[1000, 4], [0, 4]]), [], T0, at(4));
    expect(result).toMatchObject({ snr: 100, error: 'no-noise' });
  });
});

describe('calculateSNR on synthesized audio (with computeFrames)', () => {
  const RATE = 48000;
  const NOISE_RMS = 60;    // LSB
  const BURST_RMS = 6000;  // LSB -- the "counted numbers"

  // Deterministic uniform noise: amplitude a has rms a / sqrt(3).
  let seed = 1;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2 * NOISE_RMS * Math.sqrt(3);

  // 7.5 s counting phase (0.3 s 220 Hz bursts every 0.7 s, plus a 0.2 s DC
  // pop), then 4.5 s of silence-phase noise with one loud knock.
  function recording() {
    const samples = new Int16Array(12 * RATE);
    for (let i = 0; i < samples.length; i++) {
      const t = i / RATE;
      let s = noise() + 300;  // constant DC offset: must not count as noise
      if (t < 7.5 && t % 0.7 < 0.3) s += BURST_RMS * Math.SQRT2 * Math.sin(2 * Math.PI * 220 * t);
      if (t > 10 && t < 10.1) s += 20000 * Math.sin(2 * Math.PI * 900 * t);  // knock
      samples[i] = Math.round(s);
    }
    return samples;
  }

  const expectedSnr = db(Math.hypot(BURST_RMS, NOISE_RMS) / NOISE_RMS); // ~40 dB

  it('without VAD: matches the theoretical SNR within 0.5 dB', () => {
    const levels = computeFrames(recording(), RATE);
    const result = calculateSNR(levels, [], T0, at(7.5));

    expect(result.debugData.usedFallback).toBe(true);
    expect(result.debugData.noiseRms).toBeCloseTo(NOISE_RMS, -1);  // within ~5 LSB
    expect(Math.abs(result.snr - expectedSnr)).toBeLessThan(0.5);
  });

  it('with VAD: gives the same SNR from the VAD segments', () => {
    const levels = computeFrames(recording(), RATE);
    const vad = Array.from({ length: 11 }, (_, n) => ({ startTime: at(n * 0.7), endTime: at(n * 0.7 + 0.3) }));
    const result = calculateSNR(levels, vad, T0, at(7.5));

    expect(result.debugData.usedFallback).toBe(false);
    expect(Math.abs(result.snr - expectedSnr)).toBeLessThan(0.5);
  });
});
