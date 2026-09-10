// src/routes/adminBooking.js — mounted with requireAuth in server.js, same
// access level as /protocols (not master-only): slot/reservation management
// is a normal admin task, not a sensitive-data export like /session-data.
import express from "express";
import * as adminBookingController from "../controllers/adminBookingController.js";

const router = express.Router();

router.post("/slots/bulk", adminBookingController.bulkCreateSlots);
router.get("/slots", adminBookingController.listSlots);
router.delete("/slots/:slotId", adminBookingController.deleteSlot);

router.get("/bookings", adminBookingController.listBookings);
router.get("/bookings/export.csv", adminBookingController.exportBookingsCsv);

export default router;
