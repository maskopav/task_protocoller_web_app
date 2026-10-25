// src/routes/projects.js — studies, their editors and where they run (spec 8.3).
// Mounted at /projects behind requireAuth. Access is decided in the controllers:
// 404 for out-of-scope records, 403 for visible but not editable ones.
import express from "express";
import {
  getProjectList,
  getProject,
  createProject,
  updateProject,
  archiveProject,
} from "../controllers/projectController.js";
import { getProtocolsByProjectId } from "../controllers/protocolController.js";
import {
  listEditors,
  addEditor,
  removeEditor,
  putRunsAt,
  deleteRunsAt,
} from "../controllers/projectEditorController.js";

const router = express.Router();

router.get("/", getProjectList);
router.post("/", createProject);
router.get("/:id", getProject);
router.patch("/:id", updateProject);
router.post("/:id/archive", archiveProject);

router.get("/:id/protocols", getProtocolsByProjectId);

router.get("/:id/editors", listEditors);
router.post("/:id/editors", addEditor);
router.delete("/:id/editors/:userId", removeEditor);

router.put("/:id/sites/:siteId", putRunsAt);
router.delete("/:id/sites/:siteId", deleteRunsAt);

export default router;
