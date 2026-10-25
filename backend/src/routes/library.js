// src/routes/library.js — the protocol library (spec 6.10, 8.3).
// Mounted at /library behind requireAuth. Only users who may write protocols
// get in (checked in the controller: 403 otherwise). Sharing a study protocol
// is POST /protocols/:id/share.
import express from "express";
import {
  listLibrary,
  getLibraryEntry,
  copyFromLibrary,
  withdrawEntry,
} from "../controllers/libraryController.js";

const router = express.Router();

router.get("/", listLibrary);
router.get("/:id", getLibraryEntry);
router.post("/:id/copy", copyFromLibrary);
router.post("/:id/withdraw", withdrawEntry);

export default router;
