// src/routes/sites.js — admin site management (mounted behind requireAuth)
import express from "express";
import {
  getSites,
  getSiteById,
  createSite,
  updateSite,
  assignProjectToSite,
  removeProjectFromSite
} from "../controllers/siteController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// Any authenticated admin can read sites.
router.get("/", getSites);
router.get("/:id", getSiteById);

// Managing sites is restricted to the master role.
router.post("/create", requireRole("master"), createSite);
router.put("/:id", requireRole("master"), updateSite);
router.post("/:id/projects", requireRole("master"), assignProjectToSite);
router.delete("/:id/projects/:projectId", requireRole("master"), removeProjectFromSite);

export default router;