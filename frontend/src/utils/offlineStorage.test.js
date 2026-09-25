import { describe, it, expect, afterEach, vi } from 'vitest';
import { saveRecordingLocally } from './offlineStorage';

// saveRecordingLocally() is awaited directly inside ParticipantInterfacePage's
// handleTaskComplete(), which only resets its `isUploading` flag in a
// `finally` block -- a finally never runs while the await is still pending.
// indexedDB.open() has no built-in timeout and has been observed to hang
// (never fire onsuccess/onerror/onblocked) instead of rejecting, which would
// leave every task type (not just mic check) stuck the same way the original
// bug did. These tests are about whether this settles at all, not the
// happy path (already exercised implicitly wherever IDB is genuinely
// available; this suite's environment has no real indexedDB either way).

describe('offlineStorage openDB timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects instead of hanging forever when indexedDB.open() never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', {
      open: () => ({}), // returned request never fires onupgradeneeded/onsuccess/onerror
    });
    vi.stubGlobal('navigator', { storage: undefined }); // skip the non-blocking quota check path

    const promise = saveRecordingLocally('sess1_task0', new Blob(['x']), { sessionId: 'sess1' });
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(10_000 + 1_000);
    await assertion;
  });
});
