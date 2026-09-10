import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// booking-service's own signature verifier — imported directly (it has zero
// external dependencies, just node:crypto) specifically to prove this app's
// buildBookingLink actually produces a link booking-service accepts, not
// just one that looks plausible. The two services share no code at
// runtime; this is a contract check in the test suite only.
import { verifyBookingLink } from "../../../booking-service/src/utils/linkSigning.js";

const ENV_KEYS = [
  "BOOKING_SERVICE_URL", "BOOKING_SERVICE_API_KEY", "BOOKING_SERVICE_TENANT_ID",
  "BOOKING_SERVICE_LINK_SIGNING_SECRET", "BOOKING_SERVICE_RESOURCE_SLUG",
];

function setTestEnv() {
  process.env.BOOKING_SERVICE_URL = "http://localhost:4100";
  process.env.BOOKING_SERVICE_API_KEY = "bksvc_test_key";
  process.env.BOOKING_SERVICE_TENANT_ID = "1";
  process.env.BOOKING_SERVICE_LINK_SIGNING_SECRET = "test-secret";
  process.env.BOOKING_SERVICE_RESOURCE_SLUG = "standardized-room-retest";
}

function clearTestEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("computeEligibilityDate", () => {
  it("adds the given number of days", async () => {
    const { computeEligibilityDate } = await import("./bookingServiceClient.js");
    expect(computeEligibilityDate("2026-09-01 10:30:00", 14)).toBe("2026-09-15");
  });

  it("rolls over a month boundary correctly", async () => {
    const { computeEligibilityDate } = await import("./bookingServiceClient.js");
    expect(computeEligibilityDate("2026-09-25 10:30:00", 14)).toBe("2026-10-09");
  });

  it("rolls over a year boundary correctly", async () => {
    const { computeEligibilityDate } = await import("./bookingServiceClient.js");
    expect(computeEligibilityDate("2026-12-25 10:30:00", 14)).toBe("2027-01-08");
  });
});

describe("buildBookingLink", () => {
  beforeEach(setTestEnv);
  afterEach(clearTestEnv);

  it("throws a clear error when required env vars are missing", async () => {
    clearTestEnv();
    const { buildBookingLink } = await import("./bookingServiceClient.js");
    expect(() => buildBookingLink({ ref: 42, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14 }))
      .toThrow(/not configured/);
  });

  it("builds a link pointed at the configured resource slug and base URL", async () => {
    const { buildBookingLink } = await import("./bookingServiceClient.js");
    const url = buildBookingLink({ ref: 42, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14 });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("http://localhost:4100");
    expect(parsed.pathname).toBe("/book/standardized-room-retest");
    expect(parsed.searchParams.get("ref")).toBe("42");
    expect(parsed.searchParams.get("after")).toBe("2026-09-15");
  });

  it("includes lang only when provided", async () => {
    const { buildBookingLink } = await import("./bookingServiceClient.js");
    const withLang = buildBookingLink({ ref: 42, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14, lang: "cs" });
    expect(new URL(withLang).searchParams.get("lang")).toBe("cs");

    const withoutLang = buildBookingLink({ ref: 42, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14 });
    expect(new URL(withoutLang).searchParams.has("lang")).toBe(false);
  });

  // The actual point of this suite: does booking-service's own verifier
  // accept a link this app builds? A signature scheme that merely matches
  // itself is not the risk here.
  it("produces a link booking-service's own verifyBookingLink accepts", async () => {
    const { buildBookingLink } = await import("./bookingServiceClient.js");
    const url = buildBookingLink({ ref: 42, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14 });
    const params = Object.fromEntries(new URL(url).searchParams);

    expect(
      verifyBookingLink(process.env.BOOKING_SERVICE_LINK_SIGNING_SECRET, {
        tenantId: params.tenant, resourceSlug: "standardized-room-retest",
        ref: params.ref, after: params.after, exp: params.exp,
      }, params.sig)
    ).toBe(true);
  });

  it("is rejected by booking-service's verifier if the ref is tampered with after signing", async () => {
    const { buildBookingLink } = await import("./bookingServiceClient.js");
    const url = buildBookingLink({ ref: 42, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14 });
    const params = Object.fromEntries(new URL(url).searchParams);

    expect(
      verifyBookingLink(process.env.BOOKING_SERVICE_LINK_SIGNING_SECRET, {
        tenantId: params.tenant, resourceSlug: "standardized-room-retest",
        ref: "someone-else", after: params.after, exp: params.exp,
      }, params.sig)
    ).toBe(false);
  });
});

describe("ensureFollowupBookingResource / proxyBookingRequest", () => {
  beforeEach(() => {
    setTestEnv();
    vi.resetModules();
    global.fetch = vi.fn();
  });
  afterEach(() => {
    clearTestEnv();
    vi.restoreAllMocks();
  });

  it("returns the existing resource's id without creating a new one", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resources: [{ id: 7, slug: "standardized-room-retest" }] }),
    });

    const { ensureFollowupBookingResource } = await import("./bookingServiceClient.js");
    const id = await ensureFollowupBookingResource();

    expect(id).toBe(7);
    expect(global.fetch).toHaveBeenCalledTimes(1); // only the list call, no create call
  });

  it("creates the resource on first use when it doesn't exist yet", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 9, slug: "standardized-room-retest" }) });

    const { ensureFollowupBookingResource } = await import("./bookingServiceClient.js");
    const id = await ensureFollowupBookingResource();

    expect(id).toBe(9);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const createCall = global.fetch.mock.calls[1];
    expect(createCall[0]).toContain("/v1/resources");
    expect(JSON.parse(createCall[1].body).slug).toBe("standardized-room-retest");
  });

  it("caches the resolved id across calls within the process", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }),
    });

    const { ensureFollowupBookingResource } = await import("./bookingServiceClient.js");
    await ensureFollowupBookingResource();
    await ensureFollowupBookingResource();

    expect(global.fetch).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it("proxyBookingRequest attaches the Bearer API key", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { proxyBookingRequest } = await import("./bookingServiceClient.js");

    await proxyBookingRequest("/v1/bookings?resourceId=3");

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer bksvc_test_key");
  });
});
