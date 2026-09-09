// backend/src/routes/sessionData.js
import express from "express";
import { listSessions, downloadSessions } from "../controllers/sessionDataController.js";

const router = express.Router();

router.get("/sessions", listSessions);
router.get("/download", downloadSessions);

export default router;
