import express from "express";
import {
    getProjectList,
    getProjectFieldwork,
    createProject,
    updateProject
 } from "../controllers/projectController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// Reachable by survey_agency too -- both are scoped to assigned projects
// inside the controller (see getProjectList/getProjectFieldwork).
router.get("/projects-list", getProjectList);
router.get("/:projectId/fieldwork", getProjectFieldwork);

// Creating/editing a project is project-management, not fieldwork viewing
// -- kept to master/admin, excluding survey_agency.
router.post("/create", requireRole("master", "admin"), createProject);
router.put("/update", requireRole("master", "admin"), updateProject);

export default router;