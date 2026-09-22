import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
}));
vi.mock("../services/bookingServiceClient.js", () => ({
  getFollowupBookingStatusByRef: vi.fn(),
  buildBookingLink: vi.fn(),
  buildManageLink: vi.fn(),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { getFollowupBookingStatusByRef, buildBookingLink, buildManageLink } = await import("../services/bookingServiceClient.js");
const { getProjectList, getProjectFieldwork } = await import("./projectController.js");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// Regression coverage for a real authorization bug: scoping used to be
// decided by req.query.userId/role (client-supplied, trivially spoofable)
// instead of req.admin (set by authMiddleware.requireAuth from the verified
// JWT). A logged-in but non-master admin could add ?role=master to the
// request and see every project instead of just their assigned ones.
describe("getProjectList", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("runs the unfiltered query for a master admin, ignoring any query params", async () => {
    executeQuery.mockResolvedValueOnce([{ project_id: 1 }, { project_id: 2 }]);
    const req = { admin: { id: 99, role: "master" }, query: { role: "editor", userId: "1" } };
    const res = makeRes();

    await getProjectList(req, res);

    expect(executeQuery).toHaveBeenCalledWith("SELECT * FROM v_project_summary_stats", []);
    expect(res.body).toEqual([{ project_id: 1 }, { project_id: 2 }]);
  });

  it("scopes to assigned projects for a non-master admin, using req.admin.id not any client-supplied id", async () => {
    executeQuery.mockResolvedValueOnce([{ project_id: 1 }]);
    const req = { admin: { id: 7, role: "editor" }, query: { role: "master", userId: "999" } };
    const res = makeRes();

    await getProjectList(req, res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN user_projects/);
    expect(params).toEqual([7]);
  });
});

describe("getProjectFieldwork", () => {
  beforeEach(() => {
    executeQuery.mockReset();
    getFollowupBookingStatusByRef.mockReset();
    buildBookingLink.mockReset();
    buildManageLink.mockReset();
  });

  it("403s a non-master admin who isn't assigned to the requested project", async () => {
    executeQuery.mockResolvedValueOnce([]); // user_projects lookup finds nothing
    const req = { params: { projectId: "5" }, admin: { id: 7, role: "editor" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(403);
    expect(executeQuery).toHaveBeenCalledTimes(1); // never reached the fieldwork query
  });

  it("returns fieldwork rows for a non-master admin who is assigned to the project", async () => {
    executeQuery
      .mockResolvedValueOnce([{ 1: 1 }]) // assigned
      .mockResolvedValueOnce([{ session_id: 1, project_id: 5 }]);
    const req = { params: { projectId: "5" }, admin: { id: 7, role: "editor" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ session_id: 1, project_id: 5 }]);
    const fieldworkCall = executeQuery.mock.calls[1];
    expect(fieldworkCall[0]).toMatch(/FROM v_session_summary WHERE project_id = \?/);
    expect(fieldworkCall[1]).toEqual(["5"]);
  });

  it("skips the assignment check entirely for a master admin", async () => {
    executeQuery.mockResolvedValueOnce([{ session_id: 1, project_id: 5 }]);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(200);
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it("never calls booking-service when no row in the project uses the booking feature", async () => {
    executeQuery.mockResolvedValueOnce([{ session_id: 1, project_id: 5, enable_followup_booking: 0 }]);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(getFollowupBookingStatusByRef).not.toHaveBeenCalled();
    expect(res.body[0].reservation_status).toBeUndefined();
  });

  it("merges booking status only into rows whose protocol has booking enabled", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 1, project_id: 5, participant_protocol_id: 42, enable_followup_booking: 1 },
      { session_id: 2, project_id: 5, participant_protocol_id: 43, enable_followup_booking: 0 },
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map([
      ["42", { status: "booked", starts_at: "2026-10-01 09:00:00", location: "Room 1", updated_at: "2026-09-20 10:00:00" }],
      ["43", { status: "booked", starts_at: "2026-10-02 09:00:00" }], // shouldn't leak onto row 2 — its protocol doesn't use booking
    ]));
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.body[0]).toMatchObject({
      reservation_status: "booked", reservation_starts_at: "2026-10-01 09:00:00",
      reservation_location: "Room 1", reservation_updated_at: "2026-09-20 10:00:00",
    });
    expect(res.body[1].reservation_status).toBeUndefined();
  });

  // A booked respondent's Fieldwork link must match what was actually
  // emailed to them: createPublicBooking's confirmation email (and a
  // reschedule email) carries a /manage/:manageToken link, not the original
  // signed /book link -- see booking-service's emailService.js. Anyone
  // without an active booking (never engaged, or reported "no slot works")
  // still gets the original signed link, since that's what would let them
  // book for the first time or try again.
  it("shows the manage link for a row with an active booking", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 1, project_id: 5, participant_protocol_id: 42, enable_followup_booking: 1, session_completed_at: "2026-09-15 10:00:00", protocol_language_code: "cs" },
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map([
      ["42", { status: "booked", starts_at: "2026-10-01 09:00:00", manage_token: "tok123" }],
    ]));
    buildManageLink.mockImplementation(({ manageToken }) => `https://booking.example/manage/${manageToken}`);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(buildManageLink).toHaveBeenCalledWith(expect.objectContaining({ manageToken: "tok123", lang: "cs" }));
    expect(buildBookingLink).not.toHaveBeenCalled();
    expect(res.body[0].reservation_link).toBe("https://booking.example/manage/tok123");
  });

  // Same case, but a 'rescheduled' booking -- also active, also gets the
  // manage link (rescheduling doesn't rotate manage_token).
  it("shows the manage link for a rescheduled booking too", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 1, project_id: 5, participant_protocol_id: 42, enable_followup_booking: 1, session_completed_at: "2026-09-15 10:00:00" },
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map([
      ["42", { status: "rescheduled", manage_token: "tok123" }],
    ]));
    buildManageLink.mockImplementation(({ manageToken }) => `https://booking.example/manage/${manageToken}`);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.body[0].reservation_link).toBe("https://booking.example/manage/tok123");
  });

  it("falls back to the signed booking link for a row that was never booked", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 2, project_id: 5, participant_protocol_id: 43, enable_followup_booking: 1, session_completed_at: "2026-09-16 10:00:00" },
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map());
    buildBookingLink.mockImplementation(({ ref }) => `https://booking.example/book/room?ref=${ref}`);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(buildManageLink).not.toHaveBeenCalled();
    expect(res.body[0].reservation_link).toBe("https://booking.example/book/room?ref=43");
  });

  // The whole point of case 4 (no slot worked, contact info left): staff
  // must still see this happened, via the same signed link the follow-up
  // email carried -- not the manage link, since there's no real appointment.
  it("falls back to the signed booking link (not a manage link) for a 'requested' no-slot report", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 3, project_id: 5, participant_protocol_id: 44, enable_followup_booking: 1, session_completed_at: "2026-09-17 10:00:00" },
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map([
      ["44", { status: "requested", preferred_times: "mornings" }],
    ]));
    buildBookingLink.mockImplementation(({ ref }) => `https://booking.example/book/room?ref=${ref}`);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(buildManageLink).not.toHaveBeenCalled();
    expect(res.body[0].reservation_status).toBe("requested");
    expect(res.body[0].reservation_link).toBe("https://booking.example/book/room?ref=44");
  });

  it("builds no link at all for a row that hasn't completed its protocol yet", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 4, project_id: 5, participant_protocol_id: 45, enable_followup_booking: 1 }, // not completed yet
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map());
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(buildBookingLink).not.toHaveBeenCalled();
    expect(buildManageLink).not.toHaveBeenCalled();
    expect(res.body[0].reservation_link).toBeUndefined();
  });

  it("still returns the fieldwork rows (without a reservation_link) if buildBookingLink throws for a row", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 1, project_id: 5, participant_protocol_id: 42, enable_followup_booking: 1, session_completed_at: "2026-09-15 10:00:00" },
    ]);
    getFollowupBookingStatusByRef.mockResolvedValueOnce(new Map());
    buildBookingLink.mockImplementation(() => { throw new Error("booking-service is not configured"); });
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body[0].reservation_link).toBeUndefined();
  });

  it("still returns the fieldwork rows if booking-service is unreachable", async () => {
    executeQuery.mockResolvedValueOnce([
      { session_id: 1, project_id: 5, participant_protocol_id: 42, enable_followup_booking: 1 },
    ]);
    getFollowupBookingStatusByRef.mockRejectedValueOnce(new Error("fetch failed"));
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body[0].reservation_status).toBeUndefined();
  });
});
