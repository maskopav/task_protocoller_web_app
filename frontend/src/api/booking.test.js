import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getBookingLink } from "./booking";

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

describe("getBookingLink", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the bookingUrl on success", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ bookingUrl: "http://localhost:4100/book/x?..." }));

    const result = await getBookingLink(5);

    expect(result).toEqual({ bookingUrl: "http://localhost:4100/book/x?..." });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/sessions\/5\/booking-link$/);
  });

  it("appends lang as a query param when provided", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ bookingUrl: "..." }));

    await getBookingLink(5, "cs");

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("?lang=cs");
  });

  it("omits the lang param entirely when not provided", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ bookingUrl: "..." }));

    await getBookingLink(5);

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).not.toContain("lang=");
  });

  it("throws the server-provided error message on failure", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: "Protocol not completed yet" }, false));

    await expect(getBookingLink(5)).rejects.toThrow("Protocol not completed yet");
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error("not json"); } });

    await expect(getBookingLink(5)).rejects.toThrow("Failed to load the booking page");
  });
});
