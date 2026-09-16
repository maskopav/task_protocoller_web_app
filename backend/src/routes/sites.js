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

const router = express.Router();

// Reads are scoped per caller inside the controller.
router.get("/", getSites);
router.get("/:id", getSiteById);

// Writes used to be master-only at the route. They are now authorised per
// record in the controller instead, so an admin with edit rights on a project
// can create a clinic and wire their own project to it — while a clinic that
// was already there stays untouchable to everyone but a master.
router.post("/create", createSite);
router.put("/:id", updateSite);
router.post("/:id/projects", assignProjectToSite);
router.delete("/:id/projects/:projectId", removeProjectFromSite);

export default router;
