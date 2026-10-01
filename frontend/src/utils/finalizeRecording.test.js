import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./frontendLogger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), fatal: vi.fn() },
}));

// flacEncoder wraps a real WASM engine that isn't available outside a
// browser (see flacEncoder.test.js for the real correctness/round-trip
// coverage, loaded via libflacjs's Node-compatible path). This file is only
// about the encode-then-fallback decision tree, so the encoder itself is
// mocked -- default succeeds, individual tests make it reject to exercise
// the WAV fallback.
vi.mock('./flacEncoder', () => ({
  encodeFlacBlob: vi.fn(async () => new Blob(['mock-flac-bytes'], { type: 'audio/flac' })),
}));

import { initSession, appendChunk, clearSession } from './audioIDB';
import { finalizeRecording } from './finalizeRecording';
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

  it('FLAC-encodes at the native rate, unchanged', async () => {
    await appendChunk(chunkOf([1, 2, 3, 4]));

    const { blob } = await finalizeRecording(44100);

    expect(encodeFlacBlob).toHaveBeenCalledTimes(1);
    const [samplesArg, rateArg] = encodeFlacBlob.mock.calls[0];
    expect(Array.from(samplesArg)).toEqual([1, 2, 3, 4]);
    expect(rateArg).toBe(44100);
    expect(blob.type).toBe('audio/flac');
  });

  it('returns the signal levels of the recorded samples', async () => {
    await appendChunk(chunkOf([0, 16384, -32768, 3]));

    const { levels } = await finalizeRecording(44100);

    expect(levels.peakDbfs).toBe(0);
    expect(levels.fullScaleSamples).toBe(1);
  });

  it('never downsamples, even at a native rate above the old 44.1kHz target', async () => {
    // Resampling was dropped entirely (see finalizeRecording.js's header
    // comment) -- this asserts 48000 reaches the encoder unchanged, not
    // downsampled to 44100.
    const n = 4800; // 0.1s @ 48000Hz
    const values = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      values[i] = Math.round(20000 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
    }
    await appendChunk(values.buffer);

    const { blob } = await finalizeRecording(48000);

    const [samplesArg, rateArg] = encodeFlacBlob.mock.calls[0];
    expect(rateArg).toBe(48000);
    expect(samplesArg.length).toBe(n);
    expect(blob.type).toBe('audio/flac');
  });

  it('falls back to WAV (never fails) when FLAC encoding itself throws', async () => {
    await appendChunk(chunkOf([10, 20, 30, 40, 50]));
    encodeFlacBlob.mockRejectedValueOnce(new Error('FLAC WASM engine unavailable'));

    const { blob } = await finalizeRecording(44100);
    const wav = await parseWav(blob);

    expect(wav.sampleRate).toBe(44100);
    expect(Array.from(wav.pcm)).toEqual([10, 20, 30, 40, 50]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('falls back cleanly on an empty recording when FLAC encoding throws', async () => {
    encodeFlacBlob.mockRejectedValueOnce(new Error('FLAC WASM engine unavailable'));

    const { blob } = await finalizeRecording(48000);
    expect(blob.size).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
