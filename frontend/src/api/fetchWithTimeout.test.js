import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

// Same contract as recordings.test.js's neverSettlingFetch: never settles on
// its own, but rejects the moment the AbortSignal fires -- what a genuinely
// stalled connection looks like once fetchWithTimeout gives up on it.
function abortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function neverSettlingFetch() {
  return vi.fn((url, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(abortError());
      return;
    }
    options.signal.addEventListener('abort', () => reject(abortError()));
  }));
}

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves with the response on a normal, healthy connection', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await fetchWithTimeout('/x', {}, 15_000);

    expect(await res.json()).toEqual({ ok: true });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/x');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('still succeeds when the response is merely slow, not stalled', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementationOnce((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(abortError()));
      setTimeout(() => resolve(jsonResponse({ ok: true })), 10_000);
    }));

    const promise = fetchWithTimeout('/x', {}, 15_000);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  it('gives up with a clear timeout error instead of hanging forever on a dead connection', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation(neverSettlingFetch());

    const promise = fetchWithTimeout('/x', {}, 15_000);
    // catch immediately so the eventual rejection isn't reported as unhandled
    // while time is advanced below.
    const assertion = expect(promise).rejects.toThrow('Request timed out after 15s');

    await vi.advanceTimersByTimeAsync(14_000); // not yet due
    await vi.advanceTimersByTimeAsync(2_000);  // now past it

    await assertion;
  });

  it('respects a custom timeout instead of always using the default', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation(neverSettlingFetch());

    const promise = fetchWithTimeout('/x', {}, 5_000);
    const assertion = expect(promise).rejects.toThrow('Request timed out after 5s');

    await vi.advanceTimersByTimeAsync(5_001);
    await assertion;
  });

  it('falls back to the default timeout when none is passed', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockImplementation(neverSettlingFetch());

    const promise = fetchWithTimeout('/x');
    const assertion = expect(promise).rejects.toThrow('Request timed out after 15s');

    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });

  it('propagates a real network error unchanged (not mistaken for a timeout)', async () => {
    const networkError = new TypeError('Failed to fetch');
    globalThis.fetch.mockRejectedValueOnce(networkError);

    await expect(fetchWithTimeout('/x', {}, 15_000)).rejects.toBe(networkError);
  });

  it('clears its timer on success so it cannot fire (and abort a reused signal) later', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await fetchWithTimeout('/x', {}, 15_000);

    // If the timeout weren't cleared, this would fire setTimeout's callback
    // and call controller.abort() on an already-settled request -- harmless
    // here, but the point is nothing throws/rejects as a result.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(res.ok).toBe(true);
  });
});
