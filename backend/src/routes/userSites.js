import express from "express";
import { requireRole } from "../middleware/authMiddleware.js";

import {
    getUserSiteAssignments,
    assignUserToSite,
    removeUserSiteAssignment
 } from "../controllers/userSiteController.js";

const router = express.Router();

router.get("/user-sites", requireRole("master"), getUserSiteAssignments);
router.post("/assign-site", requireRole("master"), assignUserToSite);
router.delete("/remove-assignment/:id", requireRole("master"), removeUserSiteAssignment);

export default router;
