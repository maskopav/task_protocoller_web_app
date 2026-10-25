import { describe, it, expect } from "vitest";
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
