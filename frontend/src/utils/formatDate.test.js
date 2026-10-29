/* global process */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { formatShortDate, formatDateTime, formatRelative } from "./formatDate.js";

const NOW = Date.parse("2026-03-12T12:00:00Z");

describe("formatDate", () => {
  it("returns an empty string for missing or invalid input", () => {
    for (const v of [null, undefined, "", "garbage", NaN]) {
      expect(formatShortDate(v, "en")).toBe("");
      expect(formatDateTime(v, "en")).toBe("");
      expect(formatRelative(v, "en", NOW)).toBe("");
    }
  });
  it("formats a short date per locale", () => {
    expect(formatShortDate("2026-03-12T10:00:00Z", "en")).toBe("Mar 12, 2026");
    expect(formatShortDate("2026-03-12T10:00:00Z", "de")).toContain("2026");
    expect(formatShortDate("2026-03-12T10:00:00Z", "cs")).toContain("2026");
  });
  it("formats date-time with hours and minutes", () => {
    expect(formatDateTime("2026-03-12T10:05:00Z", "en")).toMatch(/2026.*\d{2}:\d{2}/);
  });
  it("formats relative times", () => {
    expect(formatRelative(NOW - 5 * 60 * 1000, "en", NOW)).toBe("5 minutes ago");
    expect(formatRelative(NOW - 3 * 3600 * 1000, "en", NOW)).toBe("3 hours ago");
    expect(formatRelative(NOW - 24 * 3600 * 1000, "en", NOW)).toBe("yesterday");
    expect(formatRelative(NOW - 10 * 1000, "en", NOW)).toBe("now");
  });
  it("falls back to a short date after about a month", () => {
    expect(formatRelative(NOW - 90 * 24 * 3600 * 1000, "en", NOW)).toBe("Dec 12, 2025");
  });
  it("localises relative output", () => {
    expect(formatRelative(NOW - 5 * 60 * 1000, "de", NOW)).toContain("5");
    expect(formatRelative(NOW - 5 * 60 * 1000, "de", NOW)).not.toBe("5 minutes ago");
  });
});

// F-067: the API sends DB datetimes; a zoneless "YYYY-MM-DD HH:MM:SS" is UTC, never browser-local.
describe("zoneless timestamps are UTC", () => {
  const prevTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Prague"; // a local-time read of a zoneless string would be off by the offset
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T17:24:34Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
  });

  it("runs under a non-UTC zone (guard for the cases below)", () => {
    expect(new Date("2026-10-26T12:00:00").getTimezoneOffset()).toBe(-60);
  });
  it("reads 'YYYY-MM-DD HH:MM:SS' saved 2 minutes ago as 2 minutes ago", () => {
    expect(formatRelative("2026-10-26 17:22:34", "en")).toBe("2 minutes ago");
  });
  it("reads a 'T' form without zone the same way", () => {
    expect(formatRelative("2026-10-26T17:22:34", "en")).toBe("2 minutes ago");
    expect(formatRelative("2026-10-26 17:22:34.000", "en")).toBe("2 minutes ago");
  });
  it("leaves Z and offset forms unchanged", () => {
    expect(formatRelative("2026-10-26T17:22:34Z", "en")).toBe("2 minutes ago");
    expect(formatRelative("2026-10-26T19:22:34+02:00", "en")).toBe("2 minutes ago");
  });
  it("formatDateTime shows the UTC instant in the local zone", () => {
    expect(formatDateTime("2026-10-26 17:22:34", "en-GB")).toContain("18:22"); // CET after DST ends on 25 Oct
  });
});
