import { describe, it, expect } from "vitest";
import { localDateString, parseUtcDbDateTime, formatUtcDbDate, formatCalendarDate } from "./dateTime";

// Expectations are built through the same local-time getters rather than
// hardcoded, so these pass in whatever timezone the test machine runs.

describe("parseUtcDbDateTime", () => {
  it("reads a DB string as UTC", () => {
    expect(parseUtcDbDateTime("2026-09-01 22:30:00").getTime()).toBe(Date.UTC(2026, 8, 1, 22, 30));
  });

  it("handles DATETIME(3) fractional seconds", () => {
    expect(parseUtcDbDateTime("2026-09-01 22:30:00.250").getTime()).toBe(Date.UTC(2026, 8, 1, 22, 30, 0, 250));
  });

  it("returns null for empty or unparseable values", () => {
    expect(parseUtcDbDateTime(null)).toBeNull();
    expect(parseUtcDbDateTime("nope")).toBeNull();
  });
});

describe("formatUtcDbDate", () => {
  it("gives the local calendar day of a UTC timestamp, not its UTC day", () => {
    const expected = localDateString(new Date(Date.UTC(2026, 8, 1, 22, 30)));
    expect(formatUtcDbDate("2026-09-01 22:30:00")).toBe(expected);
  });

  it("returns empty for empty values", () => {
    expect(formatUtcDbDate(null)).toBe("");
  });
});

describe("formatCalendarDate", () => {
  it("shows a DATE column's own day in every timezone (no UTC-midnight shift)", () => {
    expect(formatCalendarDate("2000-05-01")).toBe(new Date(2000, 4, 1).toLocaleDateString());
  });

  it("returns empty for empty values", () => {
    expect(formatCalendarDate(null)).toBe("");
  });
});

describe("localDateString", () => {
  it("formats local date components", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
