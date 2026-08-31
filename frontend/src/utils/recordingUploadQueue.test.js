import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// This module is the last line of defense for "did the participant's data
// actually get saved". Every dependency is mocked so each test can force a
// specific failure mode (network down, IDB unreadable, two upload attempts
// racing) and check the one thing that matters: a failed upload must leave
// the recording exactly where it was in IDB (never marked uploaded, never
// deleted) so a later retry can still find it, and a successful one must
// clear it and report progress -- no case may throw out of these functions,
// since they run unawaited/from timers in ParticipantInterfacePage.jsx.

vi.mock('../api/recordings', () => ({
  uploadRecording: vi.fn(async () => ({ id: 'server-id' })),
  uploadMicCheck: vi.fn(async () => ({ id: 'server-id' })),
}));
vi.mock('../api/taskResults', () => ({
  saveTaskResult: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../api/sessions', () => ({
  trackProgress: vi.fn(async () => {}),
}));
vi.mock('./offlineStorage', () => ({
  getPendingRecordingsForSession: vi.fn(async () => []),
  markRecordingStatus: vi.fn(async () => {}),
  deleteLocalRecording: vi.fn(async () => {}),
}));
vi.mock('./frontendLogger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), fatal: vi.fn() },
}));

import { uploadRecording, uploadMicCheck } from '../api/recordings';
import { saveTaskResult } from '../api/taskResults';
import { trackProgress } from '../api/sessions';
import { getPendingRecordingsForSession, markRecordingStatus, deleteLocalRecording } from './offlineStorage';
import { logger } from './frontendLogger';
import { uploadInBackground, flushPendingRecordings } from './recordingUploadQueue';

function blobMeta(overrides = {}) {
  return {
    isBlob: true, isSystemTask: false, isMicCheck: false, isAttemptOnly: false,
    progressAction: 'task_saved', protocolTaskId: 'pt1', taskOrder: 2, snrScore: null,
    ...overrides,
  };
}

// A promise the test controls the resolution/rejection of, so it can assert
// on state *while* an upload is still in flight (needed for the
// dedup/concurrency tests below).
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadInBackground', () => {
  it('uploads a blob recording, then clears it from IDB and reports progress', async () => {
    await uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0);

    expect(uploadRecording).toHaveBeenCalledTimes(1);
    expect(uploadMicCheck).not.toHaveBeenCalled();
    expect(markRecordingStatus).toHaveBeenCalledWith('rec1', 'uploaded');
    expect(deleteLocalRecording).toHaveBeenCalledWith('rec1');
    expect(trackProgress).toHaveBeenCalledWith('sess1', expect.objectContaining({
      action: 'task_saved', protocolTaskId: 'pt1', taskIndex: 2,
    }));
  });

  it('routes a mic-check blob to uploadMicCheck instead of uploadRecording', async () => {
    await uploadInBackground('mc1', new Blob(['x']), blobMeta({ isMicCheck: true }), 'sess1', 0);

    expect(uploadMicCheck).toHaveBeenCalledTimes(1);
    expect(uploadRecording).not.toHaveBeenCalled();
    expect(markRecordingStatus).toHaveBeenCalledWith('mc1', 'uploaded');
  });

  it('persists a non-blob task payload (e.g. a questionnaire) via saveTaskResult', async () => {
    const meta = blobMeta({ isBlob: false, payload: { answers: [1, 2, 3] }, repeatIndex: 2 });

    await uploadInBackground('q1', null, meta, 'sess1', 0);

    expect(saveTaskResult).toHaveBeenCalledWith(expect.objectContaining({
      protocolTaskId: 'pt1', repeat_index: 2, payload: { answers: [1, 2, 3] },
    }));
    expect(uploadRecording).not.toHaveBeenCalled();
    expect(deleteLocalRecording).toHaveBeenCalledWith('q1');
  });

  it('skips the API call for system tasks but still clears IDB and reports progress', async () => {
    await uploadInBackground('sys1', null, blobMeta({ isSystemTask: true, isBlob: false }), 'sess1', 0);

    expect(uploadRecording).not.toHaveBeenCalled();
    expect(uploadMicCheck).not.toHaveBeenCalled();
    expect(saveTaskResult).not.toHaveBeenCalled();
    expect(markRecordingStatus).toHaveBeenCalledWith('sys1', 'uploaded');
    expect(trackProgress).toHaveBeenCalled();
  });

  it('leaves the recording in IDB and logs instead of throwing when the network upload fails', async () => {
    uploadRecording.mockRejectedValueOnce(new Error('Upload timed out after 25s'));

    // Must not throw/reject: this runs unawaited from handleTaskComplete.
    await expect(uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0))
      .resolves.toBeUndefined();

    expect(markRecordingStatus).not.toHaveBeenCalled();
    expect(deleteLocalRecording).not.toHaveBeenCalled();
    expect(trackProgress).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Background upload failed (kept in IDB for retry)',
      expect.any(Error),
      expect.objectContaining({ recordingId: 'rec1' })
    );
  });

  it('never sends the same recording twice while an upload for it is still in flight', async () => {
    const inFlight = deferred();
    uploadRecording.mockReturnValueOnce(inFlight.promise);

    const first = uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0);
    // Second call fires while the first is still awaiting the network --
    // e.g. the fire-and-forget call in handleTaskComplete racing a periodic
    // flushPendingRecordings() pass over the same still-pending IDB record.
    const second = uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0);

    expect(uploadRecording).toHaveBeenCalledTimes(1); // second call was a no-op

    inFlight.resolve({ id: 'server-id' });
    await Promise.all([first, second]);

    expect(deleteLocalRecording).toHaveBeenCalledTimes(1); // only completed once
  });

  it('allows a genuine retry for the same recordingId once the previous attempt has finished', async () => {
    uploadRecording.mockRejectedValueOnce(new Error('network down'));
    await uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0);
    expect(deleteLocalRecording).not.toHaveBeenCalled(); // first attempt failed, kept in IDB

    uploadRecording.mockResolvedValueOnce({ id: 'server-id' });
    await uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0);

    expect(uploadRecording).toHaveBeenCalledTimes(2);
    expect(deleteLocalRecording).toHaveBeenCalledWith('rec1'); // second attempt succeeded
  });
});

describe('flushPendingRecordings', () => {
  function pendingRecord(id, extra = {}) {
    return { id, blob: new Blob(['x']), metadata: { sessionId: 'sess1', ...blobMeta(), ...extra } };
  }

  it('retries every pending recording found in IDB, in the order given', async () => {
    getPendingRecordingsForSession.mockResolvedValueOnce([
      pendingRecord('rec1', { taskIndex: 0 }),
      pendingRecord('rec2', { taskIndex: 1 }),
    ]);

    await flushPendingRecordings('sess1');

    expect(uploadRecording).toHaveBeenCalledTimes(2);
    expect(deleteLocalRecording).toHaveBeenNthCalledWith(1, 'rec1');
    expect(deleteLocalRecording).toHaveBeenNthCalledWith(2, 'rec2');
  });

  it('does nothing when there is nothing pending', async () => {
    getPendingRecordingsForSession.mockResolvedValueOnce([]);

    await flushPendingRecordings('sess1');

    expect(uploadRecording).not.toHaveBeenCalled();
  });

  it('stops immediately if the connection drops mid-pass instead of firing off more doomed requests', async () => {
    const nav = { onLine: true };
    vi.stubGlobal('navigator', nav);
    getPendingRecordingsForSession.mockResolvedValueOnce([
      pendingRecord('rec1'), pendingRecord('rec2'), pendingRecord('rec3'),
    ]);
    // First upload's own failure is what takes the connection down here.
    uploadRecording.mockImplementationOnce(async () => {
      nav.onLine = false;
      throw new Error('connection lost');
    });

    await flushPendingRecordings('sess1');

    expect(uploadRecording).toHaveBeenCalledTimes(1); // rec2 and rec3 never attempted
  });

  it('resolves quietly (never throws) when IDB itself cannot be read', async () => {
    getPendingRecordingsForSession.mockRejectedValueOnce(new Error('IDB blocked by another tab'));

    await expect(flushPendingRecordings('sess1')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(uploadRecording).not.toHaveBeenCalled();
  });

  it('does not duplicate an upload that a fire-and-forget call already has in flight', async () => {
    const inFlight = deferred();
    uploadRecording.mockReturnValueOnce(inFlight.promise);
    // Simulates handleTaskComplete's fire-and-forget call for the same
    // recordingId that a periodic flush is about to see still sitting in IDB.
    const backgroundCall = uploadInBackground('rec1', new Blob(['x']), blobMeta(), 'sess1', 0);

    getPendingRecordingsForSession.mockResolvedValueOnce([pendingRecord('rec1')]);
    await flushPendingRecordings('sess1');

    expect(uploadRecording).toHaveBeenCalledTimes(1); // flush's attempt was a no-op

    inFlight.resolve({ id: 'server-id' });
    await backgroundCall;
  });
});
