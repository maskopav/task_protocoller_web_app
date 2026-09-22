import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn((callback) => callback(mockConn)),
}));

vi.mock("../utils/tokenGenerator.js", () => ({
  generateToken: vi.fn(),
}));

// Declared before the mock factory above runs is not possible with const,
// so it's assigned per-test via makeConn() and the mock reads the shared
// `mockConn` binding at call time (vi.mock is hoisted, but the callback
// itself only runs when executeTransaction is actually invoked, by which
// point mockConn has been reassigned in the test's beforeEach/body).
let mockConn;

const { executeTransaction, executeQuery } = await import("../db/queryHelper.js");
const { generateToken } = await import("../utils/tokenGenerator.js");
const {
  createBooking, bulkCreateSlots, rescheduleBooking, reportNoSlotAvailable, listNoSlotReportsForAdmin,
  getActiveManageTokenByRef, getLatestContactByRef, listBookingsForAdmin,
} = await import("./bookingService.js");

function makeConn({ slotRow, existingActiveRows = [], existingRefRows = [], manageTokenCollisions = 0, insertId = 123 }) {
  let manageTokenLookups = 0;
  const calls = [];
  const query = vi.fn((sql, params) => {
    calls.push({ sql, params });

    if (sql.includes("FROM slots WHERE id = ?")) {
      return Promise.resolve([slotRow ? [slotRow] : []]);
    }
    if (sql.includes("FROM bookings WHERE resource_id = ? AND external_ref = ?")) {
      return Promise.resolve([existingRefRows]);
    }
    if (sql.includes("FROM bookings WHERE slot_id = ? AND status != 'cancelled'")) {
      return Promise.resolve([existingActiveRows]);
    }
    if (sql.includes("FROM bookings WHERE manage_token = ?")) {
      manageTokenLookups++;
      const collides = manageTokenLookups <= manageTokenCollisions;
      return Promise.resolve([collides ? [{ id: 1 }] : []]);
    }
    if (sql.includes("INSERT INTO bookings")) {
      return Promise.resolve([{ insertId }]);
    }
    // Clears any prior 'requested' row for this ref once the real booking above succeeds.
    if (sql.includes("AND status = 'requested'")) {
      return Promise.resolve([{ affectedRows: 0 }]);
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });

  return { query, calls };
}

function makeNoSlotConn({ manageTokenCollisions = 0 } = {}) {
  let manageTokenLookups = 0;
  const calls = [];
  const query = vi.fn((sql, params) => {
    calls.push({ sql, params });

    if (sql.includes("FROM bookings WHERE manage_token = ?")) {
      manageTokenLookups++;
      const collides = manageTokenLookups <= manageTokenCollisions;
      return Promise.resolve([collides ? [{ id: 1 }] : []]);
    }
    if (sql.includes("INSERT INTO bookings")) {
      return Promise.resolve([{ insertId: 1 }]);
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });

  return { query, calls };
}

describe("createBooking", () => {
  beforeEach(() => {
    generateToken.mockReset();
    generateToken.mockReturnValueOnce("token-1").mockReturnValueOnce("token-2");
  });

  it("rejects when the slot doesn't exist", async () => {
    mockConn = makeConn({ slotRow: null });
    await expect(createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" }))
      .rejects.toMatchObject({ message: "Slot is not available", statusCode: 409 });
  });

  it("rejects when the slot belongs to a different resource", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 2, is_active: 1 } });
    await expect(createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" }))
      .rejects.toMatchObject({ message: "Slot is not available", statusCode: 409 });
  });

  it("rejects when the slot is inactive", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 0 } });
    await expect(createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" }))
      .rejects.toMatchObject({ message: "Slot is not available", statusCode: 409 });
  });

  // The actual capacity-enforcement path: this is what stands in for "two
  // concurrent reservations against a single-capacity slot — only one
  // should succeed" from the plan, given a real simultaneous-transaction
  // race can't be exercised without a live DB. What's verified here is the
  // logic side of that guarantee (reject once an active booking exists);
  // the concurrency-safety side is the `FOR UPDATE` row lock, asserted
  // below, plus the DB's own generated-column UNIQUE constraint
  // (bookings_active_slot in scripts/schema/create_tables.sql) as a second,
  // independent backstop if two transactions ever did interleave past this
  // check.
  it("rejects when the slot already has an active booking", async () => {
    mockConn = makeConn({
      slotRow: { id: 15, resource_id: 1, is_active: 1 },
      existingActiveRows: [{ id: 99 }],
    });
    await expect(createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" }))
      .rejects.toMatchObject({ message: "Slot is already booked", statusCode: 409 });
  });

  it("rejects when the external ref already has another active booking for this resource", async () => {
    mockConn = makeConn({
      slotRow: { id: 15, resource_id: 1, is_active: 1 },
      existingRefRows: [{ id: 7 }],
    });
    await expect(createBooking({ resourceId: 1, slotId: 15, externalRef: "ref-42", email: "a@b.com", phone: "1" }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("locks the slot row with FOR UPDATE before checking availability", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 1 } });
    await createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" });

    const slotQuery = mockConn.calls.find((c) => c.sql.includes("FROM slots WHERE id = ?"));
    expect(slotQuery.sql).toMatch(/FOR UPDATE/);
  });

  it("succeeds and returns bookingId/manageToken/slotId when the slot is free", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 1 }, insertId: 456 });
    const result = await createBooking({ resourceId: 1, slotId: 15, externalRef: "ref-42", email: "a@b.com", phone: "1" });

    expect(result).toEqual({ bookingId: 456, manageToken: "token-1", slotId: 15 });
  });

  // Regression coverage for the 14-day-after-completion floor: it's only
  // ever validated (via the signed link's HMAC) at the HTTP layer, so
  // createBooking must persist it verbatim as eligible_after — that's the
  // only copy reschedule/cancel-then-rebook can later re-check against,
  // since this service has no way to re-derive it (external_ref is opaque).
  it("persists eligibleAfter as eligible_after on the inserted row", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 1 } });
    await createBooking({ resourceId: 1, slotId: 15, externalRef: "ref-42", email: "a@b.com", phone: "1", eligibleAfter: "2026-01-15" });

    const insertCall = mockConn.calls.find((c) => c.sql.includes("INSERT INTO bookings"));
    expect(insertCall.sql).toMatch(/eligible_after/);
    expect(insertCall.params).toContain("2026-01-15");
  });

  it("regenerates the manage token on collision", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 1 }, manageTokenCollisions: 1 });
    const result = await createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" });

    expect(result.manageToken).toBe("token-2");
    expect(generateToken).toHaveBeenCalledTimes(2);
  });

  it("runs inside a transaction", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 1 } });
    await createBooking({ resourceId: 1, slotId: 15, externalRef: "ref", email: "a@b.com", phone: "1" });
    expect(executeTransaction).toHaveBeenCalled();
  });

  // A prior "none of these times work for me" report (status='requested',
  // see reportNoSlotAvailable) shares this same table/ref -- once a real
  // booking for that ref succeeds, the stale request should stop showing up
  // in the admin's follow-up list.
  it("clears any prior 'requested' row for the same ref once the booking succeeds", async () => {
    mockConn = makeConn({ slotRow: { id: 15, resource_id: 1, is_active: 1 } });
    await createBooking({ resourceId: 1, slotId: 15, externalRef: "ref-42", email: "a@b.com", phone: "1" });

    const resolveCall = mockConn.calls.find((c) => c.sql.includes("AND status = 'requested'"));
    expect(resolveCall).toBeTruthy();
    expect(resolveCall.sql).toMatch(/UPDATE bookings SET status = 'cancelled'/);
    expect(resolveCall.params).toEqual([1, "ref-42"]);
  });
});

function makeRescheduleConn({ bookingRow, newSlotRow, existingActiveRows = [] }) {
  const calls = [];
  const query = vi.fn((sql, params) => {
    calls.push({ sql, params });

    if (sql.includes("FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.manage_token = ?")) {
      return Promise.resolve([bookingRow ? [bookingRow] : []]);
    }
    if (sql.includes("FROM slots WHERE id = ?")) {
      return Promise.resolve([newSlotRow ? [newSlotRow] : []]);
    }
    if (sql.includes("FROM bookings WHERE slot_id = ? AND status != 'cancelled'")) {
      return Promise.resolve([existingActiveRows]);
    }
    if (sql.includes("UPDATE bookings SET slot_id = ?")) {
      return Promise.resolve([{ affectedRows: 1 }]);
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });

  return { query, calls };
}

// Regression coverage for the reschedule half of the 14-day-after-completion
// bug: rescheduleBooking must re-enforce bookings.eligible_after (persisted
// at createBooking time) even though the reschedule slot picker itself has
// no signed link to carry that floor — otherwise a participant could book a
// far-future slot to pass the eligibility check once, then immediately
// reschedule to a slot that violates it.
describe("rescheduleBooking", () => {
  const bookingRow = {
    id: 5, resource_id: 1, status: "booked", eligible_after: "2026-01-15",
    slot_id: 10, old_starts_at: "2026-02-01 09:00:00", old_ends_at: "2026-02-01 09:45:00",
    old_location: null, old_google_event_id: null,
  };

  it("rejects a new slot before the booking's eligible_after", async () => {
    mockConn = makeRescheduleConn({
      bookingRow,
      newSlotRow: { id: 20, resource_id: 1, is_active: 1, starts_at: "2026-01-10 09:00:00", ends_at: "2026-01-10 09:45:00" },
    });
    await expect(rescheduleBooking("token", 20))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("2026-01-15") });
  });

  it("allows a new slot on the eligible_after date itself", async () => {
    mockConn = makeRescheduleConn({
      bookingRow,
      newSlotRow: { id: 21, resource_id: 1, is_active: 1, starts_at: "2026-01-15 09:00:00", ends_at: "2026-01-15 09:45:00" },
    });
    const result = await rescheduleBooking("token", 21);
    expect(result.newSlot.id).toBe(21);
  });

  it("allows a new slot well after eligible_after", async () => {
    mockConn = makeRescheduleConn({
      bookingRow,
      newSlotRow: { id: 22, resource_id: 1, is_active: 1, starts_at: "2026-03-01 09:00:00", ends_at: "2026-03-01 09:45:00" },
    });
    const result = await rescheduleBooking("token", 22);
    expect(result.newSlot.id).toBe(22);
  });
});

// Regression coverage for a real bug hit in manual testing: calling
// bulkCreateSlots twice with an overlapping range silently created a full
// duplicate set of slots (same resource_id/starts_at, different id),
// showing up as every time slot doubled on the booking page. Fixed by
// INSERT IGNORE + a UNIQUE(resource_id, starts_at) index (create_tables.sql);
// these tests lock in the safe-to-retry behavior at the application level.
describe("bulkCreateSlots", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("rejects when the resource doesn't belong to the tenant", async () => {
    executeQuery.mockResolvedValueOnce([]); // assertResourceOwnedByTenant finds nothing
    await expect(bulkCreateSlots(1, 999, {
      startDate: "2026-09-14", endDate: "2026-09-14", weekdays: [1],
      startTime: "09:00", endTime: "10:00", durationMin: 30,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("inserts as a single multi-row statement and reports rows the DB actually skipped as duplicates", async () => {
    const insertedRow = { id: 10, starts_at: "2026-09-14 09:00:00", ends_at: "2026-09-14 09:30:00", location: null };
    executeQuery
      .mockResolvedValueOnce([{ id: 3 }]) // ownership check passes
      // MySQL's own INSERT IGNORE affectedRows already excludes rows
      // skipped by the UNIQUE constraint -- simulating 1 of the 2 generated
      // slots already existing (e.g. from an earlier, overlapping call).
      .mockResolvedValueOnce({ affectedRows: 1 })
      // follow-up SELECT fetching back the newly-inserted row(s)
      .mockResolvedValueOnce([insertedRow]);

    // 09:00-10:00 in 30-min steps generates exactly 2 slots.
    const result = await bulkCreateSlots(1, 3, {
      startDate: "2026-09-14", endDate: "2026-09-14", weekdays: [1],
      startTime: "09:00", endTime: "10:00", durationMin: 30,
    });

    expect(result).toEqual({ created: 1, skipped: 1, insertedSlots: [insertedRow] });
    const insertCall = executeQuery.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT IGNORE INTO slots/);
    expect(insertCall[1][0]).toHaveLength(2); // both generated rows passed in one statement
    const selectCall = executeQuery.mock.calls[2];
    expect(selectCall[0]).toMatch(/SELECT id, starts_at, ends_at, location FROM slots/);
    expect(selectCall[0]).toMatch(/google_event_id IS NULL/);
  });

  it("reports 0 created when every slot in the range already exists", async () => {
    executeQuery
      .mockResolvedValueOnce([{ id: 3 }])
      .mockResolvedValueOnce({ affectedRows: 0 });

    const result = await bulkCreateSlots(1, 3, {
      startDate: "2026-09-14", endDate: "2026-09-14", weekdays: [1],
      startTime: "09:00", endTime: "10:00", durationMin: 30,
    });

    // created === 0 short-circuits the follow-up SELECT (see bookingService.js) —
    // executeQuery should have been called exactly twice, not three times.
    expect(executeQuery).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ created: 0, skipped: 2, insertedSlots: [] });
  });
});

// reportNoSlotAvailable inserts a status='requested' row into the same
// `bookings` table createBooking uses (see create_tables.sql), reusing
// generateUniqueManageToken -- so these tests follow the same
// mockConn/executeTransaction pattern as the createBooking suite above,
// rather than plain executeQuery mocking.
describe("reportNoSlotAvailable", () => {
  beforeEach(() => {
    generateToken.mockReset();
  });

  it("generates a manage token and defaults preferredTimes to null when omitted", async () => {
    generateToken.mockReturnValueOnce("token-1");
    mockConn = makeNoSlotConn();

    const result = await reportNoSlotAvailable({
      resourceId: 3, externalRef: "42", email: "a@b.com", phone: "123456", eligibleAfter: "2026-10-01",
    });

    expect(result).toEqual({ manageToken: "token-1" });
    const insertCall = mockConn.calls.find((c) => c.sql.includes("INSERT INTO bookings"));
    expect(insertCall.sql).toMatch(/'requested'/);
    expect(insertCall.params).toEqual([3, "42", "2026-10-01", "a@b.com", "123456", null, "token-1"]);
  });

  it("stores the free-text preferred-times note when provided", async () => {
    generateToken.mockReturnValueOnce("token-2");
    mockConn = makeNoSlotConn();

    await reportNoSlotAvailable({
      resourceId: 3, externalRef: "42", email: "a@b.com", phone: "123456", eligibleAfter: "2026-10-01",
      preferredTimes: "Weekday afternoons after 3pm",
    });

    const insertCall = mockConn.calls.find((c) => c.sql.includes("INSERT INTO bookings"));
    expect(insertCall.params[5]).toBe("Weekday afternoons after 3pm");
  });

  it("regenerates the token on a collision, same pattern as createBooking", async () => {
    generateToken.mockReturnValueOnce("collides").mockReturnValueOnce("unique-token");
    mockConn = makeNoSlotConn({ manageTokenCollisions: 1 });

    const result = await reportNoSlotAvailable({
      resourceId: 3, externalRef: "42", email: "a@b.com", phone: "123456", eligibleAfter: "2026-10-01",
    });

    expect(result).toEqual({ manageToken: "unique-token" });
  });
});

// getActiveManageTokenByRef backs the /book page's "already has an active
// appointment -- send them to /manage instead" check (see
// publicController.js's getPublicSlots), so a 'requested' no-slot report for
// the same ref must NOT count as active here.
describe("getActiveManageTokenByRef", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("returns the manage token when an active booking exists for this ref", async () => {
    executeQuery.mockResolvedValueOnce([{ manage_token: "abc123" }]);
    const result = await getActiveManageTokenByRef(3, "ref-42");

    expect(result).toBe("abc123");
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/status NOT IN \('cancelled', 'requested'\)/);
    expect(params).toEqual([3, "ref-42"]);
  });

  it("returns null when there's no active booking for this ref", async () => {
    executeQuery.mockResolvedValueOnce([]);
    const result = await getActiveManageTokenByRef(3, "ref-42");
    expect(result).toBeNull();
  });
});

// getLatestContactByRef backs the /book page's "don't ask for contact info
// we already have" prefill (see publicController.js's getPublicSlots) --
// unlike getActiveManageTokenByRef, it deliberately doesn't filter by
// status: a cancelled booking's or a 'requested' report's contact info is
// just as reusable as an active booking's.
describe("getLatestContactByRef", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("returns the most recent contact info for this ref regardless of status", async () => {
    executeQuery.mockResolvedValueOnce([{ contact_email: "a@b.com", contact_phone: "123456" }]);
    const result = await getLatestContactByRef(3, "ref-42");

    expect(result).toEqual({ email: "a@b.com", phone: "123456" });
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).not.toMatch(/status/);
    expect(params).toEqual([3, "ref-42"]);
  });

  it("returns null when nothing is on file for this ref", async () => {
    executeQuery.mockResolvedValueOnce([]);
    const result = await getLatestContactByRef(3, "ref-42");
    expect(result).toBeNull();
  });
});

// The Fieldwork table (in the main app) needs manage_token to rebuild the
// same reschedule/cancel link that was actually emailed to an already-booked
// respondent, instead of always showing the original slot-picker link — see
// backend/src/controllers/projectController.js's getProjectFieldwork.
describe("listBookingsForAdmin", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("selects manage_token alongside the existing columns", async () => {
    executeQuery.mockResolvedValueOnce([{ id: 1, external_ref: "42", status: "booked", manage_token: "tok123" }]);

    await listBookingsForAdmin(1, { resourceId: 3 });

    const [sql] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/b\.manage_token/);
  });
});

describe("listNoSlotReportsForAdmin", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("rejects when the resource doesn't belong to the tenant", async () => {
    executeQuery.mockResolvedValueOnce([]); // assertResourceOwnedByTenant finds nothing
    await expect(listNoSlotReportsForAdmin(1, 999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns only this resource's 'requested' rows once ownership is confirmed", async () => {
    executeQuery
      .mockResolvedValueOnce([{ id: 3 }]) // ownership check passes
      .mockResolvedValueOnce([{ id: 1, contact_email: "a@b.com" }]);

    const result = await listNoSlotReportsForAdmin(1, 3);

    expect(result).toEqual([{ id: 1, contact_email: "a@b.com" }]);
    const [sql, params] = executeQuery.mock.calls[1];
    expect(sql).toMatch(/FROM bookings WHERE resource_id = \? AND status = 'requested'/);
    expect(params).toEqual([3]);
  });
});
