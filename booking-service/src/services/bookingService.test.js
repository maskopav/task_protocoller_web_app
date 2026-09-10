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

const { executeTransaction } = await import("../db/queryHelper.js");
const { generateToken } = await import("../utils/tokenGenerator.js");
const { createBooking } = await import("./bookingService.js");

function makeConn({ slotRow, existingActiveRows = [], manageTokenCollisions = 0, insertId = 123 }) {
  let manageTokenLookups = 0;
  const calls = [];
  const query = vi.fn((sql, params) => {
    calls.push({ sql, params });

    if (sql.includes("FROM slots WHERE id = ?")) {
      return Promise.resolve([slotRow ? [slotRow] : []]);
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
});
