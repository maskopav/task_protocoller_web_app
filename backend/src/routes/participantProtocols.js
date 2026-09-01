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
  importLinkSentDates
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

// POST /api/participant-protocol/import-link-sent
// body: { project_id, rows: [{ external_id, sent_at }] } — bulk-set link_sent_at
// for a survey agency's "when we contacted this respondent" CSV.
router.post("/import-link-sent", requireAuth, importLinkSentDates);

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
