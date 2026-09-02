// src/routes/participantProtocols.js
import express from "express";
import {
  resolveParticipantToken,
  getParticipantProtocolView,
  getParticipantProtocolViewById,
  activateParticipantProtocol,
  deactivateParticipantProtocol,
  assignProtocol,
  sendManualEmail,
  swapParticipantProtocolLanguage,
  importContactEvents
} from "../controllers/participantProtocolController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// -- Admin dashboard actions: require a logged-in admin --

// Assign (activate)
router.post("/activate", requireAuth, activateParticipantProtocol);

// End assignment (deactivate)
router.post("/deactivate", requireAuth, deactivateParticipantProtocol);

// Assign other protocol to existing participant
router.post("/assign", requireAuth, assignProtocol);

// GET /api/participant-protocol?project_id=1,participant_id=1
/// e.g. http://localhost:3000/participant-protocol?project_id=1
router.get("/", requireAuth, getParticipantProtocolView);

// POST /api/participant-protocol/send-manual-email
router.post("/send-manual-email", requireAuth, sendManualEmail);

// POST /api/participant-protocol/import-contacts
// body: { project_id, contact_type: "link_sent"|"call", attempt_number, rows: [{ external_id, contacted_at, notes? }] }
// One importer for every outreach touchpoint a survey agency logs: the
// initial link send, and up to 3 follow-up calls (with notes).
router.post("/import-contacts", requireAuth, importContactEvents);

// -- Participant-facing: gated by the unguessable per-participant token itself, not admin auth --

// GET /api/participant-protocol/:token
/// e.g. http://localhost:3000/participant-protocol/99b8883a-c142-11f0-9f82-1063c8a646e0
/// Resolve unique token and load participant, project_protocol, protocol (full, including tasks)
router.get("/:token", resolveParticipantToken);

// GET /api/participant-protocol/:id
/// get single row from v_participant_protocols by participant_protocol_id
/// NOTE: unreachable today — shadowed by GET "/:token" above (same route shape, first match wins).
/// Pre-existing behavior, left as-is; not part of this auth change.
router.get("/:id", getParticipantProtocolViewById);

// PATCH /api/participant-protocol/:token/language
router.patch("/:token/language", swapParticipantProtocolLanguage);

export default router;
