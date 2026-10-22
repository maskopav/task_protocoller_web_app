// src/routes/devices.js — admin device management (mounted behind requireAuth)
import express from "express";
import { listDevices, renameDevice, makeAssignDeviceSite } from "../controllers/deviceController.js";

/** @param {{queue: {enqueue: (id: number) => void}}} deps */
export function createDevicesRouter({ queue }) {
  const router = express.Router();
  // Reads are scoped per caller inside the controller; writes are master only there too.
  router.get("/", listDevices);
  router.put("/:id", renameDevice);
  router.put("/:id/site", makeAssignDeviceSite(queue));
  return router;
}

export default createDevicesRouter;
