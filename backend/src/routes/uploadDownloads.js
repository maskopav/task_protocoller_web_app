// src/routes/uploadDownloads.js — session ZIP, clip and bundle downloads (spec §9).
// Mounted at /uploads behind requireAuth, next to routes/uploads.js. Implemented by task F.
import express from "express";

export function createUploadDownloadsRouter({ store }) {
  const router = express.Router();
  return router;
}
