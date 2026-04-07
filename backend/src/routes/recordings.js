// src/routed/recordings.js
import express from "express";
import multer from "multer";
import { uploadRecording, uploadMicCheck } from "../controllers/recordingController.js";

const router = express.Router();

// Store in memory initially, controller handles saving to disk
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/recordings/upload
router.post("/upload", upload.single("audio"), uploadRecording);
router.post("/mic-check", upload.single("audio"), uploadMicCheck);

export default router;