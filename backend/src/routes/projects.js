import express from "express";
import { 
    getProjectList,
    createProject,
    updateProject
 } from "../controllers/projectController.js";

const router = express.Router();

router.get("/projects-list", getProjectList); 
router.post("/create", createProject);
router.put("/update", updateProject);

export default router;