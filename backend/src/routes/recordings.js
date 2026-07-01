// src/routed/recordings.js
import express from "express";
import multer from "multer";
import { uploadRecording, uploadMicCheck } from "../controllers/recordingController.js";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/upload',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'coordinates', maxCount: 1 }
  ]),
  uploadRecording 
);
router.post("/mic-check", upload.single("audio"), uploadMicCheck);

export default router;