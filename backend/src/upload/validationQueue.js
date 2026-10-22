// src/upload/validationQueue.js — CONTRACT STUB (wave 0). Implemented by task A.
// Spec §4: serial and in-process. recover() re-enqueues rows left in 'validating'.

/**
 * Validates one stored session and writes the outcome to its upload_sessions
 * row (status, invalid_reason, checks, and the extracted columns). Uses
 * validateArchive and extractSession.
 *
 * @param {number} uploadSessionId  upload_sessions.id
 * @param {{store: import('../storage/fileStore.js').LocalFileStore}} deps
 */
export async function validateStoredSession(uploadSessionId, deps) {
  throw new Error("not implemented");
}

/**
 * @param {{store: import('../storage/fileStore.js').LocalFileStore,
 *          validate?: (id: number) => Promise<void>}} deps   `validate` defaults to validateStoredSession
 * @returns {{enqueue: (id: number) => void, idle: () => Promise<void>, recover: () => Promise<number>}}
 *          idle(): resolves when the queue is empty (for tests). recover(): returns how many rows were re-enqueued.
 */
export function createValidationQueue(deps) {
  throw new Error("not implemented");
}
