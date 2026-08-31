import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./frontendLogger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), fatal: vi.fn() },
}));

vi.mock('./resampleAudio', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resampleTo44100: vi.fn(actual.resampleTo44100) };
});

// flacEncoder wraps a real WASM engine that isn't available outside a
// browser (see flacEncoder.test.js for the real correctness/round-trip
// coverage, loaded via libflacjs's Node-compatible path). This file is only
// about the resample-then-encode decision tree and its fallbacks, so the
// encoder itself is mocked -- default succeeds, individual tests make it
// reject to exercise the WAV fallback.
vi.mock('./flacEncoder', () => ({
  encodeFlacBlob: vi.fn(async () => new Blob(['mock-flac-bytes'], { type: 'audio/flac' })),
}));

import { initSession, appendChunk, clearSession } from './audioIDB';
import { finalizeRecording } from './finalizeRecording';
import { resampleTo44100 } from './resampleAudio';
import { encodeFlacBlob } from './flacEncoder';
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

describe('finalizeRecording', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    encodeFlacBlob.mockImplementation(async () => new Blob(['mock-flac-bytes'], { type: 'audio/flac' }));
    await initSession();
    await clearSession();
    await initSession();
  });

  it('encodes straight to FLAC when the native rate is already at or below target', async () => {
    await appendChunk(chunkOf([1, 2, 3, 4]));

    const blob = await finalizeRecording(44100);

    expect(resampleTo44100).not.toHaveBeenCalled();
    expect(encodeFlacBlob).toHaveBeenCalledTimes(1);
    const [samplesArg, rateArg] = encodeFlacBlob.mock.calls[0];
    expect(Array.from(samplesArg)).toEqual([1, 2, 3, 4]);
    expect(rateArg).toBe(44100);
    expect(blob.type).toBe('audio/flac');
  });

  it('downsamples then FLAC-encodes the resampled audio when native rate is higher', async () => {
    const n = 4800; // 0.1s @ 48000Hz
    const values = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      values[i] = Math.round(20000 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
    }
    await appendChunk(values.buffer);

    const blob = await finalizeRecording(48000);

    expect(resampleTo44100).toHaveBeenCalledWith(expect.any(Int16Array), 48000);
    const [, rateArg] = encodeFlacBlob.mock.calls[0];
    expect(rateArg).toBe(44100);
    expect(blob.type).toBe('audio/flac');
  }, 15000);

  it('still FLAC-encodes at the native rate when only resampling fails', async () => {
    await appendChunk(chunkOf([10, 20, 30, 40, 50]));
    resampleTo44100.mockRejectedValueOnce(new Error('WASM unavailable'));

    const blob = await finalizeRecording(48000);

    const [samplesArg, rateArg] = encodeFlacBlob.mock.calls[0];
    expect(rateArg).toBe(48000); // fell back to native rate, but still lossless FLAC
    expect(Array.from(samplesArg)).toEqual([10, 20, 30, 40, 50]);
    expect(blob.type).toBe('audio/flac');
    expect(logger.error).toHaveBeenCalled();
  });

  it('falls back to WAV (never fails) when FLAC encoding itself throws', async () => {
    await appendChunk(chunkOf([10, 20, 30, 40, 50]));
    encodeFlacBlob.mockRejectedValueOnce(new Error('FLAC WASM engine unavailable'));

    const blob = await finalizeRecording(44100);
    const wav = await parseWav(blob);

    expect(wav.sampleRate).toBe(44100);
    expect(Array.from(wav.pcm)).toEqual([10, 20, 30, 40, 50]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('falls back to native-rate WAV when BOTH resampling and FLAC encoding fail', async () => {
    await appendChunk(chunkOf([1, 2, 3]));
    resampleTo44100.mockRejectedValueOnce(new Error('WASM unavailable'));
    encodeFlacBlob.mockRejectedValueOnce(new Error('FLAC WASM engine unavailable'));

    const blob = await finalizeRecording(48000);
    const wav = await parseWav(blob);

    // Recording survives even a double failure, at whatever rate was reachable.
    expect(wav.sampleRate).toBe(48000);
    expect(Array.from(wav.pcm)).toEqual([1, 2, 3]);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('falls back cleanly on an empty recording when FLAC encoding throws', async () => {
    encodeFlacBlob.mockRejectedValueOnce(new Error('FLAC WASM engine unavailable'));

    const blob = await finalizeRecording(48000);
    expect(blob.size).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
