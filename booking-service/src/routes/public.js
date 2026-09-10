// src/routes/public.js — the browser-facing API behind the hosted
// booking/manage pages (see public/). Auth is per-endpoint (signed link or
// manage token), not a shared middleware — see controllers/publicController.js.
import express from "express";
import * as publicController from "../controllers/publicController.js";

const router = express.Router();

router.get("/slots/:resourceSlug", publicController.getPublicSlots);
router.post("/bookings/:resourceSlug", publicController.createPublicBooking);

router.get("/bookings/manage/:manageToken", publicController.getManageBooking);
router.get("/bookings/manage/:manageToken/available-slots", publicController.getAvailableSlotsForReschedule);
router.put("/bookings/manage/:manageToken", publicController.rescheduleManageBooking);
router.delete("/bookings/manage/:manageToken", publicController.cancelManageBooking);

export default router;
