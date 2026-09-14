// src/components/Fieldwork/reservationStatus.js
// Resolves a Fieldwork row's reservation/booking status for the
// "Reservation" column. The raw fields this reads (`enable_followup_booking`,
// `session_completed_at`, `reservation_status`, `reservation_starts_at`,
// `reservation_location`, `reservation_updated_at`) are merged in server-side
// from booking-service — see backend/src/services/bookingServiceClient.js's
// getFollowupBookingStatusByRef and projectController.getProjectFieldwork —
// this module only turns those into a single display state.
//
// The 14-day eligibility gate (BOOKING_ELIGIBILITY_DAYS) only restricts
// which slot *dates* booking-service offers — respondents can and should
// book one of those slots right away, in advance, straight after
// completing. So "haven't booked" is timed from completion, not from when
// the appointment itself becomes eligible.

// How many days after the moment staff should expect the respondent to act
// (completion, or a cancellation) before the row is flagged as needing
// follow-up.
export const RESERVATION_FOLLOWUP_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

// session_completed_at and reservation_updated_at are genuine UTC instants
// (both written via UTC_TIMESTAMP()), unlike reservation_starts_at below —
// see formatReservationTime's own note.
function graceInfo(sinceStr) {
  const since = new Date(sinceStr.replace(" ", "T") + "Z");
  return { since: sinceStr, overdue: Date.now() > since.getTime() + RESERVATION_FOLLOWUP_DAYS * DAY_MS };
}

// One rule instead of two near-duplicates for "never booked" and "booked
// then cancelled": both just get a different anchor date for the same
// 5-day grace period.
export function reservationState(r) {
  if (!r.enable_followup_booking) return null;

  if (r.reservation_status === "booked" || r.reservation_status === "rescheduled") {
    return { kind: "booked", startsAt: r.reservation_starts_at, location: r.reservation_location };
  }
  if (r.protocol_status !== "finished") return { kind: "not_eligible_yet" };
  if (r.reservation_status === "cancelled") {
    return { kind: "cancelled", ...graceInfo(r.reservation_updated_at) };
  }
  if (!r.session_completed_at) return { kind: "not_eligible_yet" };

  return { kind: "not_booked", ...graceInfo(r.session_completed_at) };
}

// reservation_starts_at is a booking-service slot time — naive room-local
// wall-clock, NOT a UTC instant (see booking-service/src/utils/dateHelpers.js).
// Parsing it as UTC and localizing (like formatDateTime does for this app's
// own, genuinely-UTC timestamps) would silently shift it by the viewer's
// timezone offset, so this just splits the string instead of going through
// Date at all — same approach booking-service's own public/book.js uses.
function formatReservationTime(mysqlDateTime) {
  if (!mysqlDateTime) return "";
  const [date, time] = mysqlDateTime.split(" ");
  return `${date} ${time ? time.slice(0, 5) : ""}`;
}

const META = {
  booked: { dot: "#22c55e", bg: "#dcfce7", text: "#166534" },
  not_eligible_yet: { dot: "#9ca3af", bg: "#f3f4f6", text: "#4b5563" },
  pending: { dot: "#f59e0b", bg: "#fef3c7", text: "#92400e" },
  overdue: { dot: "#ef4444", bg: "#fee2e2", text: "#991b1b" },
};

// Kept deliberately terse — this is a table cell, not a sentence. Booked is
// the one state worth spelling out with real data (the timeslot); every
// other state is a single short word/phrase, and once overdue (never
// booked or cancelled, doesn't matter which) it's always just "Needs
// Follow-up" rather than two near-identical warnings.
export function reservationLabel(state) {
  if (!state) return "—";
  if (state.kind === "booked") {
    const when = formatReservationTime(state.startsAt);
    return `Booked${when ? `: ${when}` : ""}${state.location ? ` — ${state.location}` : ""}`;
  }
  if (state.kind === "not_eligible_yet") return "Not Ready";
  return state.overdue ? "⚠ Needs Follow-up" : "Pending";
}

export function reservationMeta(state) {
  if (!state || state.kind === "not_eligible_yet") return META.not_eligible_yet;
  if (state.kind === "booked") return META.booked;
  return state.overdue ? META.overdue : META.pending;
}

// select-filter key: coarser than the full state — "never booked" and
// "cancelled" collapse into the same bucket once overdue, since the action
// staff need to take (call them) is the same either way.
export function reservationFilterKey(r) {
  const state = reservationState(r);
  if (!state) return "";
  if (state.kind === "booked" || state.kind === "not_eligible_yet") return state.kind;
  return state.overdue ? "needs_followup" : "pending";
}

const SORT_ORDER = { not_eligible_yet: 0, pending: 1, booked: 3 };
export function reservationSortValue(r) {
  const key = reservationFilterKey(r);
  if (key === "") return -1;
  if (key === "needs_followup") return 2;
  return SORT_ORDER[key] ?? 0;
}
