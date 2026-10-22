// src/routes/uploadDownloads.js — session ZIP, clip and bundle downloads (spec §9).
// Mounted at /uploads behind requireAuth, next to routes/uploads.js, after the
// app-wide express.json parser (so req.body is available for the bundle POST).
import express from "express";
import { createDownloadHandlers } from "../controllers/downloadController.js";

export function createUploadDownloadsRouter({ store }) {
  const router = express.Router();
  const h = createDownloadHandlers({ store });
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // The bundle is also submitted as a plain HTML form (ticket auth), where the
  // ids arrive as one comma-separated field instead of a JSON array.
  const formIds = (req, _res, next) => {
    if (typeof req.body?.sessionIds === "string") req.body.sessionIds = req.body.sessionIds.split(",").filter(Boolean);
    next();
  };
  router.post("/download", formIds, wrap(h.bundle));
  router.get("/:sessionId/zip", wrap(h.download));
  router.get("/:sessionId/clips/*path", wrap(h.clip));
  return router;
}
