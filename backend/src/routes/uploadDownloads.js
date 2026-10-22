// src/routes/uploadDownloads.js — session ZIP, clip and bundle downloads (spec §9).
// Mounted at /uploads behind requireAuth, next to routes/uploads.js, after the
// app-wide express.json parser (so req.body is available for the bundle POST).
import express from "express";
import { createDownloadHandlers } from "../controllers/downloadController.js";

export function createUploadDownloadsRouter({ store }) {
  const router = express.Router();
  const h = createDownloadHandlers({ store });
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  router.post("/download", wrap(h.bundle));
  router.get("/:sessionId/zip", wrap(h.download));
  router.get("/:sessionId/clips/*path", wrap(h.clip));
  return router;
}
