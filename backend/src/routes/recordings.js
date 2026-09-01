// src/routed/recordings.js
import express from "express";
import multer from "multer";
import { uploadRecording, uploadMicCheck } from "../controllers/recordingController.js";

const router = express.Router();

// Recordings are capped at 2 minutes client-side. Worst case at that length:
// coordinates.json uncompressed (browsers without CompressionStream skip
// gzip, see coordinateOptimizer.js) is ~40MB, and a WAV fallback audio file
// (FLAC encoding failed) is ~10MB. 50MB/file leaves headroom for both while
// still bounding memory use -- previously there was no limit at all, so a
// stalled/misbehaving client could hold an unbounded buffer in server memory
// (multer.memoryStorage() keeps each file fully in RAM, and multipart
// uploads bypass the express.json()/urlencoded() size limits in server.js).
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_BYTES },
});

function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  next(err);
}

router.post(
  '/upload',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'coordinates', maxCount: 1 }
  ]),
  handleUploadErrors,
  uploadRecording
);
router.post("/mic-check", upload.single("audio"), handleUploadErrors, uploadMicCheck);

export default router;