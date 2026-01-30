// src/routes/sessions.js
import express from "express";
import { initSession, updateProgress, saveQuestionnaireResponse } from "../controllers/sessionController.js";

const router = express.Router();

router.post("/init", initSession);
router.post("/progress", updateProgress);
router.post("/questionnaire-response", saveQuestionnaireResponse);

export default router;