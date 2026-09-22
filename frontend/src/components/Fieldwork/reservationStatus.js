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
  // A cancellation is an explicit signal, not silence -- staff need to
  // follow up regardless of how long it's been, so unlike the old
  // behavior (grace period from reservation_updated_at, same as
  // not_booked) this is always flagged red immediately, the same way
  // no_slot_reported already is.
  if (r.reservation_status === "cancelled") {
    return { kind: "cancelled" };
  }
  // "None of these times work for me" -- a slot was never picked, but the
  // respondent did leave contact info, so this must read differently from
  // not_booked (hasn't engaged at all) and be anchored on the report itself,
  // like a cancellation, not on protocol completion.
  if (r.reservation_status === "requested") {
    return { kind: "no_slot_reported", ...graceInfo(r.reservation_updated_at) };
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
// Follow-up" rather than two near-identical warnings. Location is
// deliberately left out here — it's shown, if needed, via a separate
// column rather than crowding this cell.
export function reservationLabel(state) {
  if (!state) return "—";
  if (state.kind === "booked") {
    const when = formatReservationTime(state.startsAt);
    return `Booked${when ? `: ${when}` : ""}`;
  }
  if (state.kind === "not_eligible_yet") return "Not Ready";
  if (state.kind === "cancelled") return "Cancelled";
  if (state.overdue) return "⚠ Needs Follow-up";
  return state.kind === "no_slot_reported" ? "No Slot Found" : "Pending";
}

// The booking-management link (`reservation_link`, merged in server-side —
// see projectController.getProjectFieldwork) is the same signed URL sent to
// the participant regardless of whether they've booked yet: visiting it
// again lets them pick a first slot or reschedule/cancel an existing one.
// It's independent of `reservationState`'s kind so staff can still reach it
// even for rows not yet eligible/booked, as long as one was ever built.
export function reservationLink(r) {
  return r.reservation_link || null;
}

// The free-text note a respondent left when reporting "none of these times
// work for me" (see reportNoSlotAvailable in booking-service) — only ever
// set alongside a 'requested' reservation_status, merged in server-side
// the same way reservation_link is (projectController.getProjectFieldwork).
export function reservationNotes(r) {
  return r.reservation_preferred_times || null;
}

export function reservationMeta(state) {
  if (!state || state.kind === "not_eligible_yet") return META.not_eligible_yet;
  if (state.kind === "booked") return META.booked;
  // A no-slot report or a cancellation is an explicit signal from the
  // respondent, not just silence -- staff need to follow up regardless of
  // how many days it's been, so both are always flagged the same urgent
  // red as an overdue row, not tied to the grace period the way
  // not_booked is.
  if (state.kind === "no_slot_reported" || state.kind === "cancelled") return META.overdue;
  return state.overdue ? META.overdue : META.pending;
}

// select-filter key: coarser than the full state — "never booked" collapses
// into "needs_followup" once overdue, since the action staff need to take
// (call them) is the same regardless of anchor date. A no-slot report and a
// cancellation each get their own dedicated bucket instead of collapsing
// into pending/needs_followup: both are distinct, explicit signals from the
// respondent (see reservationMeta above), and staff need to be able to
// filter to just these rows.
export function reservationFilterKey(r) {
  const state = reservationState(r);
  if (!state) return "";
  if (state.kind === "booked" || state.kind === "not_eligible_yet" || state.kind === "no_slot_reported" || state.kind === "cancelled") return state.kind;
  return state.overdue ? "needs_followup" : "pending";
}

const SORT_ORDER = { not_eligible_yet: 0, pending: 1, no_slot_reported: 2, cancelled: 2, booked: 4 };
export function reservationSortValue(r) {
  const key = reservationFilterKey(r);
  if (key === "") return -1;
  if (key === "needs_followup") return 3;
  return SORT_ORDER[key] ?? 0;
}
