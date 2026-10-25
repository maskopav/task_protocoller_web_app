// src/routes/protocols.js
import express from "express";
import {
  saveProtocol,
  getProtocolById,
  archiveProtocol,
} from "../controllers/protocolController.js";
import { shareProtocol } from "../controllers/libraryController.js";

const router = express.Router();

// Create a protocol, or save a new version of one. Study protocols are listed
// by GET /projects/:id/protocols.
router.post("/", saveProtocol);
router.get("/:id", getProtocolById);
router.post("/:id/archive", archiveProtocol);
router.post("/:id/share", shareProtocol);

export default router;
