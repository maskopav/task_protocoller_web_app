// src/routes/adminBooking.js — mounted with requireAuth in server.js.
// Slot management (availability) is the same access level as /protocols —
// not master-only, it's a normal operational admin task. The bookings
// routes are different: they return participant contact_email/contact_phone,
// which is exactly the category of PII /session-data restricts to master
// admins — so those two get requireRole("master") here too, even though the
// only current UI entry point (Master Tools) already happens to be
// master-gated; this closes the gap for a non-master admin hitting the API
// directly with their own valid token.
import express from "express";
import * as adminBookingController from "../controllers/adminBookingController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/slots/bulk", adminBookingController.bulkCreateSlots);
router.get("/slots", adminBookingController.listSlots);
router.delete("/slots/:slotId", adminBookingController.deleteSlot);

router.get("/bookings", requireRole("master"), adminBookingController.listBookings);
router.get("/bookings/export.csv", requireRole("master"), adminBookingController.exportBookingsCsv);

export default router;
