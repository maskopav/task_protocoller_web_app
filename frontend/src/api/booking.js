// frontend/src/api/booking.js — participant-facing: no admin JWT involved,
// same public/token-gated shape as api/sessions.js.
import { fetchWithTimeout } from "./fetchWithTimeout";

const API_BASE = import.meta.env.VITE_API_BASE;

// GET /sessions/:id/booking-link -- returns a signed booking-service URL
// scoped to this participant's own completed session (server computes the
// 14-day eligibility date from sessions.completed_at; see
// backend/src/services/bookingServiceClient.js).
export async function getBookingLink(sessionId, lang) {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const res = await fetchWithTimeout(`${API_BASE}/sessions/${sessionId}/booking-link${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load the booking page");
  }
  return res.json(); // { bookingUrl }
}
