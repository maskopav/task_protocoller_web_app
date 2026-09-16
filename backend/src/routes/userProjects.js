import express from "express";
import { 
    getUserProjectAssignments, 
    assignUserToProject,
    setUserProjectCanEdit,
    removeUserProjectAssignment
 } from "../controllers/userProjectController.js";
import {
    getProjectSiteAccess,
    setProjectSiteAccess
 } from "../controllers/userProjectSiteController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// Master-only, for the same reason as /user-sites: these routes hand out the
// very scoping that getProjectList relies on — and now the edit right and the
// per-project clinic whitelist too.
router.get("/user-projects", requireRole("master"), getUserProjectAssignments);
router.post("/assign-project", requireRole("master"), assignUserToProject); 
router.put("/:id/can-edit", requireRole("master"), setUserProjectCanEdit);
router.delete("/remove-assignment/:id", requireRole("master"), removeUserProjectAssignment); 

// Which of a project's clinics one user sees through it.
router.get("/:userId/:projectId/sites", requireRole("master"), getProjectSiteAccess);
router.put("/:userId/:projectId/sites", requireRole("master"), setProjectSiteAccess);

export default router;
