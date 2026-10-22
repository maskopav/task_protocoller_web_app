// src/upload/ingestService.js — CONTRACT STUB (wave 0). Implemented by task A.
// Rules: docs/upload_management/specification.md §3.2–3.3.

/**
 * Decides and records the outcome of one received upload: checksum,
 * idempotency, device/site resolution, quarantine, commit, and the attempt row.
 * From here on it owns the temp file: the file is either committed or discarded
 * before this returns.
 *
 * @param {Awaited<ReturnType<import('./multipartReceiver.js').receiveUpload>>} upload
 * @param {{store: import('../storage/fileStore.js').LocalFileStore,
 *          queue: {enqueue: (uploadSessionId: number) => void},
 *          now?: () => Date}} deps
 * @returns {Promise<{httpCode: number, body: object}>}
 */
export async function ingestUpload(upload, deps) {
  throw new Error("not implemented");
}
