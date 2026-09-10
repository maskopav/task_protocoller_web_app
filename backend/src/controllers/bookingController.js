// src/controllers/bookingController.js — the participant-facing half of
// the booking-service adapter. HTTP glue only; link-signing logic lives in
// services/bookingServiceClient.js.
import { executeQuery } from "../db/queryHelper.js";
import { buildBookingLink } from "../services/bookingServiceClient.js";
import { BOOKING_ELIGIBILITY_DAYS } from "../config/constants.js";
import { logToFile } from "../utils/logger.js";

// GET /sessions/:id/booking-link?lang=cs
export const getBookingLink = async (req, res) => {
  const { id } = req.params;
  const { lang } = req.query;

  try {
    const [session] = await executeQuery(
      `SELECT id, participant_protocol_id, completed_at FROM sessions WHERE id = ?`,
      [id]
    );

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.completed_at) {
      // The booking step only ever renders after the protocol's own
      // completion screen synthesizes it (see ParticipantInterfacePage's
      // runtimeTasks), so this is a defensive check, not an expected path.
      return res.status(409).json({ error: "Protocol not completed yet" });
    }

    const bookingUrl = buildBookingLink({
      ref: session.participant_protocol_id,
      completedAt: session.completed_at,
      eligibilityDays: BOOKING_ELIGIBILITY_DAYS,
      lang,
    });

    res.json({ bookingUrl });
  } catch (err) {
    logToFile("ERROR", "Failed to build booking link", { sessionId: id, error: err.message });
    res.status(500).json({ error: "Failed to build booking link" });
  }
};
