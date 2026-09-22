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

  // Regression coverage for a real production incident: BookingSlotsPage
  // loads slots and bookings concurrently (Promise.all), so two calls can
  // land before the first one's cache write happens. Caching only the
  // final id left both racing to independently list-then-create the same
  // resource; the loser hit the DB's UNIQUE(tenant_id, slug) constraint and
  // surfaced as a raw 500. This proves genuinely concurrent callers now
  // share one in-flight attempt instead of racing.
  it("concurrent callers share one resolution attempt instead of racing", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 9, slug: "standardized-room-retest" }) });

    const { ensureFollowupBookingResource } = await import("./bookingServiceClient.js");
    const [idA, idB] = await Promise.all([
      ensureFollowupBookingResource(),
      ensureFollowupBookingResource(),
    ]);

    expect(idA).toBe(9);
    expect(idB).toBe(9);
    expect(global.fetch).toHaveBeenCalledTimes(2); // one list + one create, not two of each
  });

  it("clears the cached attempt on failure so a later call can retry", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { ensureFollowupBookingResource } = await import("./bookingServiceClient.js");

    await expect(ensureFollowupBookingResource()).rejects.toThrow();

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resources: [{ id: 5, slug: "standardized-room-retest" }] }),
    });
    await expect(ensureFollowupBookingResource()).resolves.toBe(5);
  });

  it("proxyBookingRequest attaches the Bearer API key", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { proxyBookingRequest } = await import("./bookingServiceClient.js");

    await proxyBookingRequest("/v1/bookings?resourceId=3");

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer bksvc_test_key");
  });

  // Regression coverage for a real production incident: admin proxy calls
  // were going out over the public BOOKING_SERVICE_URL even when mounted,
  // which meant the server calling out to its own public HTTPS address and
  // back in again through the reverse proxy — failed outright ("fetch
  // failed") on that specific hosting setup. These lock in that mounted
  // mode uses a loopback URL instead.
  describe("admin calls in mounted mode use loopback, not the public URL", () => {
    afterEach(() => {
      delete process.env.MOUNT_BOOKING_SERVICE;
      delete process.env.PORT;
      delete process.env.BOOKING_SERVICE_INTERNAL_URL;
    });

    it("defaults to http://127.0.0.1:<PORT>/booking-service when MOUNT_BOOKING_SERVICE=true", async () => {
      process.env.MOUNT_BOOKING_SERVICE = "true";
      process.env.PORT = "3000";
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { proxyBookingRequest } = await import("./bookingServiceClient.js");

      await proxyBookingRequest("/v1/bookings?resourceId=3");

      const [url] = global.fetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:3000/booking-service/v1/bookings?resourceId=3");
    });

    it("falls back to PORT 3000 if PORT isn't set", async () => {
      process.env.MOUNT_BOOKING_SERVICE = "true";
      delete process.env.PORT;
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { proxyBookingRequest } = await import("./bookingServiceClient.js");

      await proxyBookingRequest("/v1/bookings");

      const [url] = global.fetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:3000/booking-service/v1/bookings");
    });

    it("still uses the public BOOKING_SERVICE_URL when not mounted", async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { proxyBookingRequest } = await import("./bookingServiceClient.js");

      await proxyBookingRequest("/v1/bookings");

      const [url] = global.fetch.mock.calls[0];
      expect(url).toBe("http://localhost:4100/v1/bookings");
    });

    it("BOOKING_SERVICE_INTERNAL_URL overrides the mounted-mode default", async () => {
      process.env.MOUNT_BOOKING_SERVICE = "true";
      process.env.PORT = "3000";
      process.env.BOOKING_SERVICE_INTERNAL_URL = "http://127.0.0.1:9999/custom";
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { proxyBookingRequest } = await import("./bookingServiceClient.js");

      await proxyBookingRequest("/v1/bookings");

      const [url] = global.fetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:9999/custom/v1/bookings");
    });

    it("buildBookingLink still uses the public URL even when mounted (a participant's browser needs it, not loopback)", async () => {
      process.env.MOUNT_BOOKING_SERVICE = "true";
      process.env.PORT = "3000";
      const { buildBookingLink } = await import("./bookingServiceClient.js");

      const url = buildBookingLink({ ref: 1, completedAt: "2026-09-01 10:00:00", eligibilityDays: 14 });

      expect(url.startsWith("http://localhost:4100/book/")).toBe(true);
    });
  });

  describe("getFollowupBookingStatusByRef", () => {
    // No no-slot reports involved -- an empty reports list every time here.
    function mockNoReports() {
      return { ok: true, json: async () => ({ reports: [] }) };
    }

    it("keys the map by external_ref", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [
          { external_ref: "42", status: "booked", starts_at: "2026-10-01 09:00:00" },
        ] }) })
        .mockResolvedValueOnce(mockNoReports());

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      const byRef = await getFollowupBookingStatusByRef();

      expect(byRef.get("42")).toMatchObject({ status: "booked" });
      expect(byRef.get("999")).toBeUndefined();
    });

    // Regression coverage: a respondent can cancel then rebook, leaving two
    // rows in booking-service's history for the same ref. The map must
    // reflect the current reality (the active one), not whichever happened
    // to be listed last.
    it("prefers the active booking over an older cancelled row for the same ref", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [
          { external_ref: "42", status: "cancelled", updated_at: "2026-09-10 10:00:00" },
          { external_ref: "42", status: "booked", updated_at: "2026-09-12 10:00:00" },
        ] }) })
        .mockResolvedValueOnce(mockNoReports());

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      const byRef = await getFollowupBookingStatusByRef();

      expect(byRef.get("42").status).toBe("booked");
    });

    // A ref with only cancelled history (never rebooked) should still show
    // its most recent cancellation, not the oldest one.
    it("keeps the most recently updated row when every row for a ref is cancelled", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [
          { external_ref: "42", status: "cancelled", updated_at: "2026-09-10 10:00:00" },
          { external_ref: "42", status: "cancelled", updated_at: "2026-09-15 10:00:00" },
        ] }) })
        .mockResolvedValueOnce(mockNoReports());

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      const byRef = await getFollowupBookingStatusByRef();

      expect(byRef.get("42").updated_at).toBe("2026-09-15 10:00:00");
    });

    it("throws when booking-service's bookings call fails", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      await expect(getFollowupBookingStatusByRef()).rejects.toThrow(/Failed to list bookings/);
    });

    // Case 4 from the reservation-link review: a respondent who said "none
    // of these times work" (no slot picked, contact info left) has to show
    // up in the Fieldwork table just like a real booking would -- otherwise
    // staff have no way to see that report happened at all. These rows come
    // from a separate booking-service endpoint (/v1/no-slot-reports) since
    // listBookingsForAdmin's own query inner-joins on slots and silently
    // drops them (see booking-service's bookingService.js).
    it("merges a 'requested' no-slot report into the map, tagged with status 'requested'", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ reports: [
          { external_ref: "42", contact_email: "a@b.com", preferred_times: "mornings", created_at: "2026-09-18 10:00:00" },
        ] }) });

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      const byRef = await getFollowupBookingStatusByRef();

      expect(byRef.get("42")).toMatchObject({ status: "requested", preferred_times: "mornings" });
    });

    it("prefers an active booking over a 'requested' no-slot report for the same ref", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [
          { external_ref: "42", status: "booked", updated_at: "2026-09-01 10:00:00" },
        ] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ reports: [
          { external_ref: "42", created_at: "2026-09-20 10:00:00" }, // later, but not an active appointment
        ] }) });

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      const byRef = await getFollowupBookingStatusByRef();

      expect(byRef.get("42").status).toBe("booked");
    });

    // Between two non-active rows for the same ref (a cancelled booking and
    // a later no-slot report, or vice versa) the more recent one wins --
    // same "current reality" rule as two cancelled bookings above.
    it("prefers the more recent of a cancelled booking and a 'requested' report for the same ref", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [
          { external_ref: "42", status: "cancelled", updated_at: "2026-09-10 10:00:00" },
        ] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ reports: [
          { external_ref: "42", created_at: "2026-09-20 10:00:00" },
        ] }) });

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      const byRef = await getFollowupBookingStatusByRef();

      expect(byRef.get("42").status).toBe("requested");
    });

    it("throws when booking-service's no-slot-reports call fails", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ bookings: [] }) })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const { getFollowupBookingStatusByRef } = await import("./bookingServiceClient.js");
      await expect(getFollowupBookingStatusByRef()).rejects.toThrow(/Failed to list no-slot reports/);
    });
  });

  // Lets bookingController.getBookingLink check, for one specific
  // respondent, whether they already have an active appointment *before*
  // deciding which link to hand back -- a single targeted lookup
  // (booking-service's own indexed query), not the bulk list
  // getFollowupBookingStatusByRef uses for the whole Fieldwork table.
  describe("getActiveManageTokenByRef", () => {
    it("returns the manage token when an active booking exists for this ref", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ manageToken: "tok123" }) });

      const { getActiveManageTokenByRef } = await import("./bookingServiceClient.js");
      const result = await getActiveManageTokenByRef("42");

      expect(result).toBe("tok123");
      const [url] = global.fetch.mock.calls[1];
      expect(url).toContain("/v1/bookings/active-manage-token?resourceId=3&externalRef=42");
    });

    it("returns null when there's no active booking for this ref", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ manageToken: null }) });

      const { getActiveManageTokenByRef } = await import("./bookingServiceClient.js");
      expect(await getActiveManageTokenByRef("42")).toBeNull();
    });

    it("throws when booking-service's lookup call fails", async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [{ id: 3, slug: "standardized-room-retest" }] }) })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const { getActiveManageTokenByRef } = await import("./bookingServiceClient.js");
      await expect(getActiveManageTokenByRef("42")).rejects.toThrow(/Failed to look up active booking/);
    });
  });

  describe("buildManageLink", () => {
    beforeEach(setTestEnv);
    afterEach(clearTestEnv);

    // A booked respondent's Fieldwork link must be the exact reschedule/
    // cancel link they were actually emailed (see emailService's
    // manageLinkFor in booking-service), not the original slot-picker link.
    it("builds a /manage/:token link off the configured public URL", async () => {
      const { buildManageLink } = await import("./bookingServiceClient.js");
      const url = buildManageLink({ manageToken: "tok123", lang: "cs" });
      const parsed = new URL(url);

      expect(parsed.origin).toBe("http://localhost:4100");
      expect(parsed.pathname).toBe("/manage/tok123");
      expect(parsed.searchParams.get("lang")).toBe("cs");
    });

    it("omits lang when not provided", async () => {
      const { buildManageLink } = await import("./bookingServiceClient.js");
      const url = buildManageLink({ manageToken: "tok123" });
      expect(new URL(url).searchParams.has("lang")).toBe(false);
    });
  });
});
