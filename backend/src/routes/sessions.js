// src/routes/sessions.js
import express from "express";
import { initSession, updateProgress } from "../controllers/sessionController.js";

const router = express.Router();

router.post("/init", initSession);
router.post("/progress", updateProgress);

export default router;