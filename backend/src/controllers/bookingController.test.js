import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
}));
vi.mock("../services/bookingServiceClient.js", () => ({
  buildBookingLink: vi.fn(),
  buildManageLink: vi.fn(),
  getActiveManageTokenByRef: vi.fn(),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { buildBookingLink, buildManageLink, getActiveManageTokenByRef } = await import("../services/bookingServiceClient.js");
const { getBookingLink } = await import("./bookingController.js");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe("getBookingLink", () => {
  beforeEach(() => {
    executeQuery.mockReset();
    buildBookingLink.mockReset();
    buildManageLink.mockReset();
    getActiveManageTokenByRef.mockReset();
    getActiveManageTokenByRef.mockResolvedValue(null); // no active booking, by default
  });

  it("404s when the session doesn't exist", async () => {
    executeQuery.mockResolvedValueOnce([]);
    const req = { params: { id: "999" }, query: {} };
    const res = makeRes();

    await getBookingLink(req, res);

    expect(res.statusCode).toBe(404);
    expect(buildBookingLink).not.toHaveBeenCalled();
  });

  it("409s when the protocol isn't completed yet", async () => {
    executeQuery.mockResolvedValueOnce([{ id: 5, participant_protocol_id: 42, completed_at: null }]);
    const req = { params: { id: "5" }, query: {} };
    const res = makeRes();

    await getBookingLink(req, res);

    expect(res.statusCode).toBe(409);
    expect(buildBookingLink).not.toHaveBeenCalled();
  });

  // The check this guards against showing the booking iframe at all when a
  // reservation already exists: booking-service's own /book page already
  // redirects to /manage after loading (see getPublicSlots' existingBooking
  // check), but that means an extra round trip and a flash of the slot
  // picker first. Checking here means BookingStep embeds the right page
  // from the start.
  it("sends the participant straight to their manage link when an active booking already exists", async () => {
    executeQuery.mockResolvedValueOnce([
      { id: 5, participant_protocol_id: 42, completed_at: "2026-09-01 10:00:00" },
    ]);
    getActiveManageTokenByRef.mockResolvedValueOnce("tok123");
    buildManageLink.mockReturnValue("http://localhost:4100/manage/tok123");
    const req = { params: { id: "5" }, query: { lang: "cs" } };
    const res = makeRes();

    await getBookingLink(req, res);

    expect(getActiveManageTokenByRef).toHaveBeenCalledWith(42);
    expect(buildManageLink).toHaveBeenCalledWith(expect.objectContaining({ manageToken: "tok123", lang: "cs" }));
    expect(buildBookingLink).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ bookingUrl: "http://localhost:4100/manage/tok123" });
  });

  it("builds the link using the session's participant_protocol_id as ref and passes lang through", async () => {
    executeQuery.mockResolvedValueOnce([
      { id: 5, participant_protocol_id: 42, completed_at: "2026-09-01 10:00:00" },
    ]);
    buildBookingLink.mockReturnValue("http://localhost:4100/book/standardized-room-retest?...");
    const req = { params: { id: "5" }, query: { lang: "cs" } };
    const res = makeRes();

    await getBookingLink(req, res);

    expect(buildBookingLink).toHaveBeenCalledWith(expect.objectContaining({
      ref: 42, completedAt: "2026-09-01 10:00:00", lang: "cs",
    }));
    expect(buildManageLink).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ bookingUrl: "http://localhost:4100/book/standardized-room-retest?..." });
  });

  it("500s and logs when buildBookingLink throws (e.g. misconfigured env)", async () => {
    executeQuery.mockResolvedValueOnce([
      { id: 5, participant_protocol_id: 42, completed_at: "2026-09-01 10:00:00" },
    ]);
    buildBookingLink.mockImplementation(() => { throw new Error("booking-service is not configured"); });
    const req = { params: { id: "5" }, query: {} };
    const res = makeRes();

    await getBookingLink(req, res);

    expect(res.statusCode).toBe(500);
  });
});
