import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSession, appendChunk, getAllSamplesInt16, encodeWAV, clearSession } from './audioIDB';

// This test environment has no `indexedDB` global (vitest runs in plain
// Node), so initSession() falls through to the in-memory fallback path —
// the same path real browsers use when IndexedDB is disabled/quota-limited.
// That makes this an exercise of genuine fallback behavior, not a mock.

function chunkOf(values) {
  return Int16Array.from(values).buffer;
}

function parseWav(blob) {
  return blob.arrayBuffer().then((buf) => {
    const view = new DataView(buf);
    const readStr = (offset, len) => String.fromCharCode(...new Uint8Array(buf, offset, len));
    return {
      riff: readStr(0, 4),
      wave: readStr(8, 4),
      fmtTag: readStr(12, 4),
      audioFormat: view.getUint16(20, true),
      numChannels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      byteRate: view.getUint32(28, true),
      blockAlign: view.getUint16(32, true),
      bitsPerSample: view.getUint16(34, true),
      dataTag: readStr(36, 4),
      dataSize: view.getUint32(40, true),
      pcm: new Int16Array(buf.slice(44)),
    };
  });
}

describe('audioIDB', () => {
  beforeEach(async () => {
    await initSession();
    await clearSession();
    await initSession();
  });

  it('merges appended chunks in order without dropping or reordering samples', async () => {
    await appendChunk(chunkOf([1, 2, 3]));
    await appendChunk(chunkOf([4, 5]));
    await appendChunk(chunkOf([6, 7, 8, 9]));

    const merged = await getAllSamplesInt16();
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('encodeWAV produces a spec-correct, uncorrupted 16-bit mono PCM header', async () => {
    const samples = Int16Array.from([100, -100, 32767, -32768, 0]);
    const blob = encodeWAV(samples, 48000);
    const wav = await parseWav(blob);

    expect(wav.riff).toBe('RIFF');
    expect(wav.wave).toBe('WAVE');
    expect(wav.fmtTag).toBe('fmt ');
    expect(wav.audioFormat).toBe(1); // PCM
    expect(wav.numChannels).toBe(1);
    expect(wav.sampleRate).toBe(48000);
    expect(wav.bitsPerSample).toBe(16);
    expect(wav.blockAlign).toBe(2); // 1 channel * 16 bits / 8
    expect(wav.byteRate).toBe(48000 * 2);
    expect(wav.dataTag).toBe('data');
    expect(wav.dataSize).toBe(samples.length * 2);
    expect(Array.from(wav.pcm)).toEqual(Array.from(samples));
  });

  it('returns empty output for a session with no recorded audio', async () => {
    const samples = await getAllSamplesInt16();
    expect(samples.length).toBe(0);
    expect(encodeWAV(samples, 48000).size).toBe(0);
    expect(encodeWAV(new Int16Array(0), 48000).size).toBe(0);
  });

  it('clearSession empties the store so the next session starts clean', async () => {
    await appendChunk(chunkOf([1, 2, 3]));
    await clearSession();

    const samples = await getAllSamplesInt16();
    expect(samples.length).toBe(0);
  });
});

describe('audioIDB openDB timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  // initSession() already falls back to the in-memory path on any
  // *rejection* from openDB() (see the try/catch there). indexedDB.open()
  // has been observed to hang instead of firing onsuccess/onerror at all --
  // this proves that's now bounded, so startRecording() (which awaits
  // initSession() via useVoiceRecorder.js) can't get stuck on it forever.
  it('falls back to the in-memory path instead of hanging when indexedDB.open() never settles', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', {
      open: () => ({}), // returned request never fires onupgradeneeded/onsuccess/onerror
    });

    const { initSession: initSessionFresh, appendChunk: appendChunkFresh, getAllSamplesInt16: getAllFresh } =
      await import('./audioIDB');

    const promise = initSessionFresh();
    let settled = false;
    promise.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(10_000 + 1_000);
    await promise;

    expect(settled).toBe(true);

    // and the module is actually usable afterwards, via the memory fallback
    await appendChunkFresh(Int16Array.from([7, 8, 9]).buffer);
    const samples = await getAllFresh();
    expect(Array.from(samples)).toEqual([7, 8, 9]);
  });
});
