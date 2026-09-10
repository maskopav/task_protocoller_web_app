// @vitest-environment jsdom
// jsdom (not the default 'node' environment) because apiClient.apiFetch
// reads localStorage for the admin JWT — see IntroComponents.test.jsx for
// the same per-file environment override pattern.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bulkCreateSlots, fetchSlots, deleteSlot, fetchBookings } from "./adminBooking";

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

describe("adminBooking API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.setItem("adminToken", "test-jwt");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("bulkCreateSlots posts the form fields and attaches the admin JWT", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ created: 10, skipped: 0 }));

    const result = await bulkCreateSlots({
      startDate: "2026-09-14", endDate: "2026-09-18", weekdays: [1, 2, 3, 4, 5],
      startTime: "09:00", endTime: "16:00", durationMin: 45,
    });

    expect(result).toEqual({ created: 10, skipped: 0 });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/admin\/booking\/slots\/bulk$/);
    expect(options.headers.Authorization).toBe("Bearer test-jwt");
    expect(JSON.parse(options.body).durationMin).toBe(45);
  });

  it("bulkCreateSlots throws the server error message on failure", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: "Failed to create slots" }, false));

    await expect(bulkCreateSlots({})).rejects.toThrow("Failed to create slots");
  });

  it("fetchSlots requests activeOnly=true when asked", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ slots: [] }));

    await fetchSlots({ activeOnly: true });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("activeOnly=true");
  });

  it("deleteSlot succeeds on a 204 with no JSON body", async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 204 });

    await expect(deleteSlot(3)).resolves.toBeUndefined();
  });

  it("deleteSlot throws the server error on failure", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: "Cannot delete a slot with an active booking" }, false));

    await expect(deleteSlot(3)).rejects.toThrow("Cannot delete a slot with an active booking");
  });

  it("fetchBookings returns the bookings list", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ bookings: [{ id: 1 }] }));

    const result = await fetchBookings();

    expect(result).toEqual({ bookings: [{ id: 1 }] });
  });
});
