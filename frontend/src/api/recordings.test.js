import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { uploadRecording, uploadMicCheck, computeUploadTimeoutMs } from './recordings';

// uploadRecording/uploadMicCheck are the last hop before a recording is
// considered "saved" -- these tests are about what happens to that promise
// on a bad connection: does it eventually resolve when the network is just
// slow, does it fail predictably (not hang forever) when the network is
// truly stuck, and does a real network error come through unchanged so the
// caller (recordingUploadQueue.js) can tell the difference and retry.

function abortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

// Simulates fetch()'s real contract with an AbortSignal: never settles on
// its own, but rejects the moment the signal fires -- same as a genuinely
// stalled connection would look like once fetchWithTimeout gives up on it.
function neverSettlingFetch() {
  return vi.fn((url, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(abortError());
      return;
    }
    options.signal.addEventListener('abort', () => reject(abortError()));
  }));
}

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body, text: async () => JSON.stringify(body) };
}

function baseMetadata() {
  return {
    token: 'tok', sessionId: 'sess1', protocolTaskId: 'pt1', taskCategory: 'voice',
    taskOrder: 1, duration: 5, taskParam: '', repeatIndex: 1, timeStamp: Date.now(),
  };
}

describe('computeUploadTimeoutMs', () => {
  it('gives a small payload roughly the base timeout', () => {
    expect(computeUploadTimeoutMs(0)).toBe(10_000);
  });

  it('scales up with payload size so a real (slow) multi-MB transfer is not cut off early', () => {
    const oneMb = computeUploadTimeoutMs(1024 * 1024);
    const fiveMb = computeUploadTimeoutMs(5 * 1024 * 1024);
    expect(oneMb).toBeGreaterThan(10_000);
    expect(fiveMb).toBeGreaterThan(oneMb);
  });

  it('caps at a hard ceiling instead of waiting forever on a huge payload', () => {
    const huge = computeUploadTimeoutMs(500 * 1024 * 1024);
    expect(huge).toBe(300_000);
  });
});

describe('uploadRecording', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves with the server response on a normal, healthy connection', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'rec1' }));
    const blob = new Blob(['audio-bytes'], { type: 'audio/flac' });

    const result = await uploadRecording(blob, baseMetadata());

    expect(result).toEqual({ id: 'rec1' });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/recordings\/upload$/);
    expect(options.method).toBe('POST');
    expect(options.body.get('sessionId')).toBe('sess1');
    expect(options.body.get('audio').name).toBe('recording.flac'); // FLAC blob -> .flac filename
  });

  it('names the file .wav when finalizeRecording fell back to WAV', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'rec1' }));
    const blob = new Blob(['audio-bytes'], { type: 'audio/wav' });

    await uploadRecording(blob, baseMetadata());

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.body.get('audio').name).toBe('recording.wav');
  });

  it('still succeeds when the response is merely slow, not stalled', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve(jsonResponse({ id: 'rec1' })), 8_000);
    }));
    const blob = new Blob(['x'], { type: 'audio/flac' }); // tiny -> ~10s timeout budget

    const promise = uploadRecording(blob, baseMetadata());
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(promise).resolves.toEqual({ id: 'rec1' });
  });

  it('throws the server-provided message when the server rejects the upload', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: 'Session already completed' }, false));
    const blob = new Blob(['x'], { type: 'audio/flac' });

    await expect(uploadRecording(blob, baseMetadata())).rejects.toThrow('Session already completed');
  });

  it('falls back to a generic message when the server error body is not JSON', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new Error('not json'); },
      text: async () => '<html>502 Bad Gateway</html>',
    });
    const blob = new Blob(['x'], { type: 'audio/flac' });

    await expect(uploadRecording(blob, baseMetadata())).rejects.toThrow('Upload failed');
  });

  it('gives up with a clear timeout error instead of hanging forever on a dead connection', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation(neverSettlingFetch());
    const blob = new Blob(['x'], { type: 'audio/flac' }); // tiny payload -> base 10s timeout

    const promise = uploadRecording(blob, baseMetadata());
    // catch immediately so the eventual rejection isn't reported as unhandled
    // while we advance time below.
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    // Not yet due: still well within the size-scaled timeout budget.
    await vi.advanceTimersByTimeAsync(9_000);
    // Now past it.
    await vi.advanceTimersByTimeAsync(2_000);

    await assertion;
  });

  it('gives a larger recording proportionally more time before declaring it dead', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation(neverSettlingFetch());
    // ~5 MB, well above the base-timeout-only case above.
    const blob = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'audio/flac' });
    const expectedTimeout = computeUploadTimeoutMs(blob.size);

    const promise = uploadRecording(blob, baseMetadata());
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    // A 10s budget (the small-payload case) would already have fired here --
    // the larger payload must not have timed out yet.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // still one in-flight attempt, not retried/duplicated

    await vi.advanceTimersByTimeAsync(expectedTimeout - 10_000 + 1_000);
    await assertion;
  });

  it('propagates a real network error unchanged (not mistaken for a timeout)', async () => {
    const networkError = new TypeError('Failed to fetch');
    globalThis.fetch.mockRejectedValueOnce(networkError);
    const blob = new Blob(['x'], { type: 'audio/flac' });

    await expect(uploadRecording(blob, baseMetadata())).rejects.toBe(networkError);
  });
});

describe('uploadMicCheck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function micMetadata() {
    return { token: 'tok', sessionId: 'sess1', snrScore: 12, duration: 3, attemptNumber: 1, speechSegments: [[0, 1]] };
  }

  it('resolves with the server response on success', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const blob = new Blob(['x'], { type: 'audio/flac' });

    await expect(uploadMicCheck(blob, micMetadata())).resolves.toEqual({ ok: true });
    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.body.get('speechSegments')).toBe(JSON.stringify([[0, 1]]));
  });

  it('times out rather than hanging on a dead connection', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation(neverSettlingFetch());
    const blob = new Blob(['x'], { type: 'audio/flac' });

    const promise = uploadMicCheck(blob, micMetadata());
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(computeUploadTimeoutMs(blob.size) + 1_000);
    await assertion;
  });

  it('throws on a server-side failure response', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: 'Bad SNR payload' }, false));
    const blob = new Blob(['x'], { type: 'audio/flac' });

    await expect(uploadMicCheck(blob, micMetadata())).rejects.toThrow('Bad SNR payload');
  });
});
