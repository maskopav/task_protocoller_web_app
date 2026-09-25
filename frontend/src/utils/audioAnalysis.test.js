import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateSNR } from './audioAnalysis';

// calculateSNR is the last step of MicCheck's "analyzing" phase (MicCheck.jsx
// handleNoiseCheckComplete awaits it directly). If it never settles, MicCheck
// never leaves the 'analyzing' phase, Recorder's autoSubmit-triggered
// handleNextTask never resolves, and isUploading is only ever reset in its
// catch block -- so the "Try again" button stays disabled forever and the
// participant sees Recorder's generic RECORDED-state message with no way
// out. These tests are about whether calculateSNR always settles, not just
// on the happy path.

function jsonResponse(body, ok = true) {
  return { ok, arrayBuffer: async () => body };
}

function neverSettlingDecodeAudioData() {
  return vi.fn(() => new Promise(() => {})); // like the real hang: never resolves, never rejects
}

describe('calculateSNR', () => {
  let decodeAudioData;

  beforeEach(() => {
    decodeAudioData = vi.fn();
    // must be a real function (not an arrow) so `new window.AudioContext()` works
    const AudioContextMock = vi.fn(function AudioContext() { return { decodeAudioData }; });
    // audioAnalysis.js reads window.AudioContext; this suite runs under
    // vitest's 'node' environment, which has no window at all.
    vi.stubGlobal('window', { AudioContext: AudioContextMock });
    vi.stubGlobal('AudioContext', AudioContextMock);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves with an SNR value on a normal recording', async () => {
    const sampleRate = 16000;
    const length = sampleRate * 2; // 2s
    const channelData = new Float32Array(length).fill(0.05);
    // give the "speech" half more energy than the "noise" half
    for (let i = 0; i < length / 2; i++) channelData[i] = 0.5;

    globalThis.fetch.mockResolvedValueOnce(jsonResponse(new ArrayBuffer(1000)));
    decodeAudioData.mockResolvedValueOnce({
      getChannelData: () => channelData,
      sampleRate,
    });

    const result = await calculateSNR(
      'blob:fake',
      [{ startTime: 0, endTime: 1000 }],
      0
    );

    expect(result.error).toBeNull();
    expect(result.snr).toBeGreaterThan(0);
  });

  it('does not hang forever when decodeAudioData never settles (the reported bug)', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(new ArrayBuffer(1000)));
    decodeAudioData.mockImplementation(neverSettlingDecodeAudioData());

    const promise = calculateSNR('blob:fake', [{ startTime: 0, endTime: 1000 }], 0);

    // calculateSNR's own try/catch can only ever see a *rejection*, so
    // registering an assertion before advancing timers proves it truly
    // settles rather than just failing to resolve.
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(settled).toBe(true);
    const result = await promise;
    expect(result.error).toBeTruthy(); // failed, not stuck -- MicCheck can show its retry UI
    expect(result.error).not.toBe('muted'); // a decode timeout isn't a muted mic
  });

  it('reports a muted mic when the recorded file is empty', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(new ArrayBuffer(10)));

    const result = await calculateSNR('blob:fake', [{ startTime: 0, endTime: 1000 }], 0);

    expect(result.error).toBe('muted');
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  it('reports a muted mic when the decoded audio is silent', async () => {
    const sampleRate = 16000;
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(new ArrayBuffer(1000)));
    decodeAudioData.mockResolvedValueOnce({
      getChannelData: () => new Float32Array(sampleRate).fill(0),
      sampleRate,
    });

    const result = await calculateSNR('blob:fake', [{ startTime: 0, endTime: 1000 }], 0);

    expect(result.error).toBe('muted');
  });

  it('recovers with a processing error instead of hanging when the fetch itself stalls', async () => {
    // Mirrors fetch()'s real AbortSignal contract: never settles on its own,
    // rejects only once fetchWithTimeout's internal timer aborts it.
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const promise = calculateSNR('blob:fake', [{ startTime: 0, endTime: 1000 }], 0);
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });

    await vi.advanceTimersByTimeAsync(20_000);

    expect(settled).toBe(true);
  });
});
