import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  reservationState,
  reservationLabel,
  reservationMeta,
  reservationFilterKey,
  reservationSortValue,
  reservationLink,
  reservationNotes,
  RESERVATION_FOLLOWUP_DAYS,
} from "./reservationStatus";

const NOW = new Date("2026-09-20T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("reservationState", () => {
  it("returns null when the protocol doesn't use follow-up booking", () => {
    expect(reservationState({ enable_followup_booking: 0, protocol_status: "finished" })).toBeNull();
  });

  it("is 'booked' whenever an active booking exists", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished",
      reservation_status: "booked", reservation_starts_at: "2026-10-01 09:00:00", reservation_location: "Room 1",
    });
    expect(state).toEqual({ kind: "booked", startsAt: "2026-10-01 09:00:00", location: "Room 1" });
  });

  it("is 'booked' for a rescheduled booking too", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished", reservation_status: "rescheduled",
      reservation_starts_at: "2026-10-01 09:00:00",
    });
    expect(state.kind).toBe("booked");
  });

  it("is 'not_eligible_yet' when the participant hasn't finished the protocol", () => {
    const state = reservationState({ enable_followup_booking: 1, protocol_status: "in_progress" });
    expect(state).toEqual({ kind: "not_eligible_yet" });
  });

  // Respondents can book any time after completing (in advance, for a slot
  // at least BOOKING_ELIGIBILITY_DAYS out) — so the "haven't booked yet"
  // clock starts at completion, not at whenever the earliest slot opens.
  it("is 'not_booked', not overdue, within the grace period right after completion", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished",
      session_completed_at: "2026-09-17 12:00:00", // 3 days ago; grace is RESERVATION_FOLLOWUP_DAYS (5)
    });
    expect(state).toMatchObject({ kind: "not_booked", overdue: false });
  });

  it("is 'not_booked' and overdue once the grace period since completion has elapsed", () => {
    const completedDaysAgo = RESERVATION_FOLLOWUP_DAYS + 1;
    const completedAt = new Date(NOW.getTime() - completedDaysAgo * 24 * 60 * 60 * 1000);
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished",
      session_completed_at: completedAt.toISOString().slice(0, 19).replace("T", " "),
    });
    expect(state).toMatchObject({ kind: "not_booked", overdue: true });
  });

  it("is 'cancelled', anchored on the cancellation itself rather than completion", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished", reservation_status: "cancelled",
      reservation_updated_at: "2026-09-19 12:00:00", // 1 day ago -- within grace
      session_completed_at: "2026-08-01 00:00:00", // long past -- must NOT be used as the anchor
    });
    expect(state).toMatchObject({ kind: "cancelled", overdue: false });
  });

  it("flags a cancelled booking as overdue once its own grace period elapses", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished", reservation_status: "cancelled",
      reservation_updated_at: "2026-09-01 12:00:00",
    });
    expect(state).toMatchObject({ kind: "cancelled", overdue: true });
  });

  // Case 4: the respondent said none of the offered slots worked and left
  // contact info instead -- this must be visibly distinct from "hasn't
  // engaged at all" (not_booked), anchored on the report itself like a
  // cancellation is, not on protocol completion.
  it("is 'no_slot_reported', anchored on the report itself, when a no-slot report is on file", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished", reservation_status: "requested",
      reservation_updated_at: "2026-09-19 12:00:00", // 1 day ago -- within grace
      session_completed_at: "2026-08-01 00:00:00", // long past -- must NOT be used as the anchor
    });
    expect(state).toMatchObject({ kind: "no_slot_reported", overdue: false });
  });

  it("flags a no-slot report as overdue once its own grace period elapses", () => {
    const state = reservationState({
      enable_followup_booking: 1, protocol_status: "finished", reservation_status: "requested",
      reservation_updated_at: "2026-09-01 12:00:00",
    });
    expect(state).toMatchObject({ kind: "no_slot_reported", overdue: true });
  });
});

describe("reservationLabel", () => {
  it("shows a blank dash for a null state", () => {
    expect(reservationLabel(null)).toBe("—");
  });

  // reservation_starts_at is booking-service's naive room-local time, not a
  // UTC instant -- this must NOT run it through Date/timezone conversion.
  it("formats the booked time without any timezone shift", () => {
    const label = reservationLabel({ kind: "booked", startsAt: "2026-10-01 09:30:00", location: "Room 1" });
    expect(label).toBe("Booked: 2026-10-01 09:30");
  });

  it("is brief and consistent regardless of why a row is overdue", () => {
    expect(reservationLabel({ kind: "not_booked", overdue: false })).toBe("Pending");
    expect(reservationLabel({ kind: "not_booked", overdue: true })).toBe("⚠ Needs Follow-up");
    expect(reservationLabel({ kind: "cancelled", overdue: false })).toBe("Pending");
    expect(reservationLabel({ kind: "cancelled", overdue: true })).toBe("⚠ Needs Follow-up");
  });

  it("says 'Not Ready' for a participant who hasn't finished the protocol yet", () => {
    expect(reservationLabel({ kind: "not_eligible_yet" })).toBe("Not Ready");
  });

  it("says 'No Slot Found' for a no-slot report, unless overdue", () => {
    expect(reservationLabel({ kind: "no_slot_reported", overdue: false })).toBe("No Slot Found");
    expect(reservationLabel({ kind: "no_slot_reported", overdue: true })).toBe("⚠ Needs Follow-up");
  });
});

describe("reservationMeta", () => {
  it("colors overdue states distinctly from merely pending ones", () => {
    const pending = reservationMeta({ kind: "not_booked", overdue: false });
    const overdue = reservationMeta({ kind: "not_booked", overdue: true });
    expect(pending.bg).not.toBe(overdue.bg);
  });

  // A no-slot report is an explicit "none of these work for me" from the
  // respondent -- staff need to call them back with real alternatives
  // regardless of how many days it's been, so this is always the same
  // urgent color as an overdue row, not tied to the grace period.
  it("colors a no-slot report the same urgent red whether or not it's overdue yet", () => {
    const fresh = reservationMeta({ kind: "no_slot_reported", overdue: false });
    const stale = reservationMeta({ kind: "no_slot_reported", overdue: true });
    const overdue = reservationMeta({ kind: "not_booked", overdue: true });
    expect(fresh).toEqual(overdue);
    expect(stale).toEqual(overdue);
  });
});

describe("reservationLink", () => {
  it("returns the merged-in link when present", () => {
    expect(reservationLink({ reservation_link: "https://booking.example/book/room?ref=1" })).toBe(
      "https://booking.example/book/room?ref=1"
    );
  });

  it("returns null when no link was merged in (e.g. not eligible yet, or the merge failed)", () => {
    expect(reservationLink({})).toBeNull();
  });
});

describe("reservationNotes", () => {
  it("returns the merged-in preferred-times note when present", () => {
    expect(reservationNotes({ reservation_preferred_times: "Mornings work best" })).toBe("Mornings work best");
  });

  it("returns null when no note was left (e.g. a real booking, not a no-slot report)", () => {
    expect(reservationNotes({})).toBeNull();
  });
});

describe("reservationFilterKey / reservationSortValue", () => {
  it("groups never-booked and cancelled-and-overdue under the same 'needs_followup' bucket", () => {
    const neverBooked = { enable_followup_booking: 1, protocol_status: "finished", session_completed_at: "2026-08-01 00:00:00" };
    const cancelled = { enable_followup_booking: 1, protocol_status: "finished", reservation_status: "cancelled", reservation_updated_at: "2026-08-01 00:00:00" };
    expect(reservationFilterKey(neverBooked)).toBe("needs_followup");
    expect(reservationFilterKey(cancelled)).toBe("needs_followup");
  });

  // A no-slot report gets its own dedicated filter bucket rather than being
  // lumped into 'pending'/'needs_followup' -- it's an explicit, distinct
  // signal from the respondent, and staff need to be able to filter to just
  // these rows instead of finding them mixed in with everyone who simply
  // hasn't engaged yet.
  it("gives a no-slot report its own filter bucket, whether or not it's overdue", () => {
    const fresh = { enable_followup_booking: 1, protocol_status: "finished", reservation_status: "requested", reservation_updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") };
    const stale = { enable_followup_booking: 1, protocol_status: "finished", reservation_status: "requested", reservation_updated_at: "2026-08-01 00:00:00" };
    expect(reservationFilterKey(fresh)).toBe("no_slot_reported");
    expect(reservationFilterKey(stale)).toBe("no_slot_reported");
  });

  it("sorts a booked row above a needs-followup row", () => {
    const booked = { enable_followup_booking: 1, protocol_status: "finished", reservation_status: "booked", reservation_starts_at: "2026-10-01 09:00:00" };
    const needsFollowup = { enable_followup_booking: 1, protocol_status: "finished", session_completed_at: "2026-08-01 00:00:00" };
    expect(reservationSortValue(booked)).toBeGreaterThan(reservationSortValue(needsFollowup));
  });

  it("sorts a no-slot report between pending and needs-followup", () => {
    const pending = { enable_followup_booking: 1, protocol_status: "finished", session_completed_at: "2026-09-19 12:00:00" };
    const noSlotReported = { enable_followup_booking: 1, protocol_status: "finished", reservation_status: "requested", reservation_updated_at: "2026-09-19 12:00:00" };
    const needsFollowup = { enable_followup_booking: 1, protocol_status: "finished", session_completed_at: "2026-08-01 00:00:00" };
    expect(reservationSortValue(noSlotReported)).toBeGreaterThan(reservationSortValue(pending));
    expect(reservationSortValue(needsFollowup)).toBeGreaterThan(reservationSortValue(noSlotReported));
  });
});
