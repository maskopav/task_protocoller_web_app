// src/routes/admin.js — server-to-server admin API. Mounted with
// requireApiKey in server.js; no logic here, just wiring (mirrors
// task_protocoller_web_app/backend/src/routes/*.js).
import express from "express";
import * as adminController from "../controllers/adminController.js";

const router = express.Router();

router.post("/resources", adminController.createResource);
router.get("/resources", adminController.listResources);

router.post("/slots/bulk", adminController.bulkCreateSlots);
router.get("/slots", adminController.listSlots);
router.delete("/slots/:slotId", adminController.deleteSlot);

router.get("/bookings", adminController.listBookings);
router.get("/bookings/export.csv", adminController.exportBookingsCsv);

router.post("/webhooks", adminController.registerWebhook);
router.get("/webhooks", adminController.listWebhooks);

export default router;
