// src/routes/sessions.js
import express from "express";
import { initSession, updateProgress, updateSessionIdentifiers } from "../controllers/sessionController.js";
import { getBookingLink } from "../controllers/bookingController.js";

const router = express.Router();

router.post("/init", initSession);
router.post("/progress", updateProgress);
router.put("/:id/identifiers", updateSessionIdentifiers);
router.get("/:id/booking-link", getBookingLink);

export default router;
