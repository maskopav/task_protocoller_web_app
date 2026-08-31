// utils/recordingUploadQueue.js
//
// Owns the "recording is safely in IndexedDB, now get it to the server" half
// of the save pipeline. Isolated from ParticipantInterfacePage.jsx so this
// retry/dedup logic -- the part that answers "is the participant's data
// actually saved, even on a bad connection?" -- is a plain set of functions
// that can be unit tested without mounting the page (which pulls in VAD,
// video, audio-guide, and permission-dialog machinery that has nothing to do
// with upload correctness). Mirrors the same rationale as finalizeRecording.js
// being split out of useVoiceRecorder.js.
import { uploadRecording, uploadMicCheck } from '../api/recordings';
import { saveTaskResult } from '../api/taskResults';
import { trackProgress } from '../api/sessions';
import {
  getPendingRecordingsForSession,
  markRecordingStatus,
  deleteLocalRecording,
} from './offlineStorage';
import { logger } from './frontendLogger';

// Guards against uploading the same recordingId twice concurrently -- e.g.
// the fire-and-forget call from handleTaskComplete racing a periodic
// flushPendingRecordings() pass over the same still-pending record.
const activeUploads = new Set();

/**
 * Uploads one recording (or non-blob task payload), and on success removes
 * it from IDB and reports progress. On failure, the record is left in IDB
 * exactly as it was -- callers don't need their own try/catch, and a later
 * flushPendingRecordings() call will retry it. Never throws.
 */
export async function uploadInBackground(recordingId, blob, meta, sessionId, taskIndex) {
  if (activeUploads.has(recordingId)) return;
  activeUploads.add(recordingId);

  try {
    if (meta.isSystemTask) {
      // Do nothing API-wise
    } else if (meta.isMicCheck && meta.isBlob) {
      await uploadMicCheck(blob, meta);
    } else if (meta.isBlob) {
      await uploadRecording(blob, meta);
    } else if (meta.isMicCheck) {
      // Mic-check "skipped" event with no audio — nothing to persist to task_results.
      // Progress (skipped, attempts) is captured via trackProgress below instead.
    } else {
      await saveTaskResult({
        sessionId: meta.sessionId,
        protocolTaskId: meta.protocolTaskId,
        repeat_index: meta.repeatIndex || 1,
        payload: meta.payload
      });
    }

    await markRecordingStatus(recordingId, 'uploaded');
    await deleteLocalRecording(recordingId);

    await trackProgress(sessionId, {
      action: meta.progressAction,
      protocolTaskId: meta.protocolTaskId,
      ...(meta.isAttemptOnly  && { snrScore: meta.snrScore }),
      ...(!meta.isAttemptOnly && !meta.isMicCheck && { taskIndex: meta.taskOrder }),
    });
    logger.info(`[BG Upload] task ${taskIndex} uploaded and removed from IDB ✓`);

  } catch (err) {
    logger.error("Background upload failed (kept in IDB for retry)", err, {
      taskIndex,
      recordingId
    });
  } finally {
    activeUploads.delete(recordingId);
  }
}

/**
 * Retries every recording still sitting in IDB as 'pending' for this
 * session, via the same per-record path as uploadInBackground (which
 * no-ops if that recordingId is already mid-upload). Safe to call from a
 * timer or effect -- it never throws, and stops early if the connection
 * drops mid-pass rather than piling up doomed requests.
 */
export async function flushPendingRecordings(sessionId) {
  try {
    const pending = await getPendingRecordingsForSession(sessionId);
    if (pending.length === 0) return;

    logger.info(`[Flush] Retrying ${pending.length} pending recording(s)`);

    for (const record of pending) {
      if (!navigator.onLine) break;
      await uploadInBackground(record.id, record.blob, record.metadata, sessionId, record.metadata?.taskIndex);
    }
  } catch (err) {
    logger.error(`[Flush] Error reading IDB: ${err.message}`);
  }
}
