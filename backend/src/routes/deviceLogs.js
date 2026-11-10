// src/routes/deviceLogs.js
//
// POST /device-logs — the desktop app's rotated log files (docs/device_logs/01_spec.md §2).
// Public, gated by the site token inside the ingest. Mounted before the app-wide
// JSON parsers, like /upload: the body is a multipart stream that only the
// receiver may consume.
import express from "express";
import { receiveDeviceLog, UploadRequestError } from "../upload/multipartReceiver.js";
import { ingestDeviceLog } from "../deviceLogs/ingest.js";
import { createDeviceLogLimiter } from "../middleware/rateLimiter.js";
import { logToFile } from "../utils/logger.js";

/**
 * @param {{store: import('../storage/fileStore.js').LocalFileStore, maxBytes: number,
 *          limits?: {minFreeBytes: number}}} deps
 */
export function createDeviceLogRouter({ store, maxBytes, limits }) {
  const router = express.Router();

  router.post("/", createDeviceLogLimiter(), async (req, res) => {
    try {
      const upload = await receiveDeviceLog(req, { store, maxBytes });
      const { httpCode, body } = await ingestDeviceLog(upload, { store, ...(limits ? { limits } : {}) });
      res.status(httpCode).json(body);
    } catch (err) {
      if (err instanceof UploadRequestError) return res.status(err.httpCode).json({ error: err.error });
      // Route, status and device id only (spec §7): never the token, the file
      // content or the client filename, and no driver message, which can quote values.
      logToFile("ERROR", "Device log failed", {
        route: "POST /device-logs", status: 500, deviceId: err?.deviceId ?? null, code: err?.code ?? err?.name ?? "Error",
      });
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
