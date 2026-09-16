import express from "express";
import { 
    getProjectList,
    createProject,
    updateProject
 } from "../controllers/projectController.js";

const router = express.Router();

// All three are authorised inside the controller rather than at the route: a
// non-master may hold can_create_projects, or an explicit per-project grant.
router.get("/projects-list", getProjectList); 
router.post("/create", createProject);
router.put("/update", updateProject);

export default router;
