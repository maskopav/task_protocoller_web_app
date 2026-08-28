import express from "express";
import {
    getUserSiteAssignments,
    assignUserToSite,
    removeUserSiteAssignment
 } from "../controllers/userSiteController.js";

const router = express.Router();

router.get("/user-sites", getUserSiteAssignments);
router.post("/assign-site", assignUserToSite);
router.delete("/remove-assignment/:id", removeUserSiteAssignment);

export default router;
