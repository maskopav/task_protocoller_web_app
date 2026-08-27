import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./frontendLogger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), fatal: vi.fn() },
}));

vi.mock('./resampleAudio', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resampleTo44100: vi.fn(actual.resampleTo44100) };
});

import { initSession, appendChunk, clearSession } from './audioIDB';
import { finalizeRecordingWAV } from './finalizeRecording';
import { resampleTo44100 } from './resampleAudio';
import { logger } from './frontendLogger';

function chunkOf(values) {
  return Int16Array.from(values).buffer;
}

function parseWav(blob) {
  return blob.arrayBuffer().then((buf) => {
    const view = new DataView(buf);
    return {
      sampleRate: view.getUint32(24, true),
      numSamples: view.getUint32(40, true) / 2,
      pcm: new Int16Array(buf.slice(44)),
    };
  });
}

describe('finalizeRecordingWAV', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await initSession();
    await clearSession();
    await initSession();
  });

  it('skips resampling entirely when the native rate is already at or below target', async () => {
    await appendChunk(chunkOf([1, 2, 3, 4]));

    const blob = await finalizeRecordingWAV(44100);
    const wav = await parseWav(blob);

    expect(resampleTo44100).not.toHaveBeenCalled();
    expect(wav.sampleRate).toBe(44100);
    expect(Array.from(wav.pcm)).toEqual([1, 2, 3, 4]);
  });

  it('downsamples to 44.1kHz and encodes the resampled audio when native rate is higher', async () => {
    const n = 4800; // 0.1s @ 48000Hz
    const values = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      values[i] = Math.round(20000 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
    }
    await appendChunk(values.buffer);

    const blob = await finalizeRecordingWAV(48000);
    const wav = await parseWav(blob);

    expect(resampleTo44100).toHaveBeenCalledWith(expect.any(Int16Array), 48000);
    expect(wav.sampleRate).toBe(44100);
    const expectedLength = Math.round(n * (44100 / 48000));
    expect(Math.abs(wav.numSamples - expectedLength)).toBeLessThan(Math.max(64, expectedLength * 0.02));
  }, 15000);

  it('falls back to the native-rate WAV (never fails) when resampling throws', async () => {
    await appendChunk(chunkOf([10, 20, 30, 40, 50]));
    resampleTo44100.mockRejectedValueOnce(new Error('WASM unavailable'));

    const blob = await finalizeRecordingWAV(48000);
    const wav = await parseWav(blob);

    // Recording is preserved at native rate rather than lost.
    expect(wav.sampleRate).toBe(48000);
    expect(Array.from(wav.pcm)).toEqual([10, 20, 30, 40, 50]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('falls back cleanly even when resampling throws on an empty recording', async () => {
    resampleTo44100.mockRejectedValueOnce(new Error('WASM unavailable'));

    const blob = await finalizeRecordingWAV(48000);
    expect(blob.size).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
