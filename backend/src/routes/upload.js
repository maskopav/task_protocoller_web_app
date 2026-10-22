// src/routes/upload.js
//
// POST /upload — the desktop app's session upload (spec §3). Public, gated by
// the site token inside ingestUpload. Must be mounted before the app-wide
// JSON/urlencoded parsers: the body is a multi-GB multipart stream that only
// multipartReceiver may consume.
import express from "express";
import { receiveUpload, UploadRequestError } from "../upload/multipartReceiver.js";
import { ingestUpload, recordRejectedAttempt } from "../upload/ingestService.js";
import { createUploadLimiter } from "../middleware/rateLimiter.js";
import { logToFile } from "../utils/logger.js";

/**
 * @param {{store: import('../storage/fileStore.js').LocalFileStore,
 *          queue: {enqueue: (id: number) => void},
 *          maxBytes: number}} deps
 */
export function createUploadRouter({ store, queue, maxBytes, limits }) {
  const router = express.Router();

  router.post("/", createUploadLimiter(), async (req, res) => {
    let sessionId = null;
    try {
      const upload = await receiveUpload(req, { store, maxBytes });
      sessionId = upload.fields.sessionId;
      const { httpCode, body } = await ingestUpload(upload, { store, queue, ...(limits ? { limits } : {}) });
      res.status(httpCode).json(body);
    } catch (err) {
      if (err instanceof UploadRequestError) {
        await recordRejectedAttempt(err).catch(() => {});
        return res.status(err.httpCode).json({ error: err.error });
      }
      // sessionId and an error code only: messages from the DB driver or the
      // file system can quote values (and the temp path is irrelevant).
      logToFile("ERROR", "Upload failed", { sessionId, code: err?.code ?? err?.name ?? "Error" });
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
