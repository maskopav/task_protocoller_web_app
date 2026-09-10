import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
}));
vi.mock("../services/bookingServiceClient.js", () => ({
  buildBookingLink: vi.fn(),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { buildBookingLink } = await import("../services/bookingServiceClient.js");
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
