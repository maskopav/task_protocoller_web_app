// src/routes/participantProtocols.js
import express from "express";
import {  
  resolveParticipantToken,
  getParticipantProtocolView,
  getParticipantProtocolViewById,
  activateParticipantProtocol,
  deactivateParticipantProtocol,
  assignProtocol,
  sendManualEmail
} from "../controllers/participantProtocolController.js";

const router = express.Router();

// Assign (activate)
router.post("/activate", activateParticipantProtocol);

// End assignment (deactivate)
router.post("/deactivate", deactivateParticipantProtocol);

// Assign other protocol to existing participant
router.post("/assign", assignProtocol);

// GET /api/participant-protocol/:token
/// e.g. http://localhost:3000/participant-protocol/99b8883a-c142-11f0-9f82-1063c8a646e0
/// Resolve unique token and load participant, project_protocol, protocol (full, including tasks)
router.get("/:token", resolveParticipantToken);

// GET /api/participant-protocol?project_id=1,participant_id=1
/// e.g. http://localhost:3000/participant-protocol?project_id=1
router.get("/", getParticipantProtocolView);

// GET /api/participant-protocol/:id
/// get single row from v_participant_protocols by participant_protocol_id
router.get("/:id", getParticipantProtocolViewById);
  
// POST /api/participant-protocol/send-manual-email
router.post("/send-manual-email", sendManualEmail);

export default router;
