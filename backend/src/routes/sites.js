// src/routes/sites.js — clinics (mounted behind requireAuth)
import express from "express";
import {
  getSites,
  getSiteById,
  createSite,
  updateSite,
} from "../controllers/siteController.js";

const router = express.Router();

// Reads are scoped per caller inside the controller, and so are the writes
// (master, a user with can_create_sites, or the clinic's creator).
// "Runs at" is PUT/DELETE /projects/:id/sites/:siteId.
router.get("/", getSites);
router.post("/", createSite);
router.get("/:id", getSiteById);
router.patch("/:id", updateSite);

export default router;
