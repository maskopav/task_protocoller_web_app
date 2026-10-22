// src/routes/uploads.js — admin read/review API for uploaded sessions (spec §8).
// Mounted at /uploads behind requireAuth. Implemented by task E.
// Downloads live in routes/uploadDownloads.js (task F), mounted on the same path.
import express from "express";
import {
  listUploads, exportCsv, getSummary, getUpload, getAttempts,
  revealParticipant, patchParticipant, putQc, getComments, addComment,
} from "../controllers/uploadController.js";

const router = express.Router();

// Literal paths first, or ":sessionId" would swallow them.
router.get("/", listUploads);
router.get("/export.csv", exportCsv);
router.get("/summary", getSummary);
router.get("/:sessionId", getUpload);
router.get("/:sessionId/attempts", getAttempts);
router.post("/:sessionId/reveal", revealParticipant);
router.patch("/:sessionId/participant", patchParticipant);
router.put("/:sessionId/qc", putQc);
router.get("/:sessionId/comments", getComments);
router.post("/:sessionId/comments", addComment);

export default router;
