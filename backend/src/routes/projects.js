import express from "express";
import {
    getProjectList,
    getProjectFieldwork,
    createProject,
    updateProject
 } from "../controllers/projectController.js";

const router = express.Router();

router.get("/projects-list", getProjectList);
router.get("/:projectId/fieldwork", getProjectFieldwork);
router.post("/create", createProject);
router.put("/update", updateProject);

export default router;