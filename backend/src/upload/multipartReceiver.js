// src/upload/multipartReceiver.js — CONTRACT STUB (wave 0). Implemented by task A.
// Rules: docs/upload_management/specification.md §3.1.

export class UploadRequestError extends Error {
  /** @param {number} httpCode @param {string} error  snake_case code for the JSON body */
  constructor(httpCode, error, message = error) {
    super(message);
    this.httpCode = httpCode;
    this.error = error;
  }
}

/**
 * Streams one upload request to a temp file while hashing it. It never buffers
 * the ZIP and never logs the client filename. On any rejection the temp file is
 * removed.
 *
 * @param {import('express').Request} req
 * @param {{store: import('../storage/fileStore.js').LocalFileStore, maxBytes: number}} opts
 * @returns {Promise<{
 *   fields: {installationId: string, sessionId: string, zipSha256: string, siteToken?: string, appVersion?: string},
 *   file: {tempPath: string, bytes: number, sha256: string}
 * }>}  rejects with UploadRequestError (400) for a malformed request
 */
export async function receiveUpload(req, opts) {
  throw new Error("not implemented");
}
