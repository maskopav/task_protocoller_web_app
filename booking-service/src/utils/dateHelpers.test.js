import { describe, it, expect } from "vitest";
import { iterateDates, weekdayOf, addMinutesToTime, isPastCutoff, pad2, nowAsMysqlDateTime, todayAsLocalDate } from "./dateHelpers.js";

describe("pad2", () => {
  it("pads single digits, leaves two digits alone", () => {
    expect(pad2(5)).toBe("05");
    expect(pad2(15)).toBe("15");
  });
});

describe("iterateDates", () => {
  it("yields every date inclusive of start and end", () => {
    expect([...iterateDates("2026-09-14", "2026-09-16")]).toEqual([
      "2026-09-14", "2026-09-15", "2026-09-16",
    ]);
  });

  it("yields exactly the single date when start equals end", () => {
    expect([...iterateDates("2026-09-14", "2026-09-14")]).toEqual(["2026-09-14"]);
  });

  it("crosses a month boundary correctly", () => {
    expect([...iterateDates("2026-09-29", "2026-10-02")]).toEqual([
      "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
  });
});

describe("weekdayOf", () => {
  it("matches known weekdays (0=Sun..6=Sat)", () => {
    expect(weekdayOf("2026-09-14")).toBe(1); // Monday
    expect(weekdayOf("2026-09-13")).toBe(0); // Sunday
    expect(weekdayOf("2026-09-19")).toBe(6); // Saturday
  });
});

describe("addMinutesToTime", () => {
  it("adds minutes within the same day", () => {
    expect(addMinutesToTime("09:00", 30)).toBe("09:30");
    expect(addMinutesToTime("09:45", 30)).toBe("10:15");
  });

  it("returns null when the result would spill past midnight", () => {
    expect(addMinutesToTime("23:45", 30)).toBeNull();
  });

  it("allows landing exactly on midnight boundary (24:00 is out of range, 23:59+1min is not representable, but reaching < 24:00 is fine)", () => {
    expect(addMinutesToTime("23:30", 29)).toBe("23:59");
  });
});

describe("isPastCutoff", () => {
  const slotStart = "2026-09-20 10:00:00"; // Sunday

  it("is false well before the cutoff", () => {
    const now = new Date("2026-09-15T10:00:00");
    expect(isPastCutoff(slotStart, 24, now)).toBe(false);
  });

  it("is true once inside the cutoff window", () => {
    const now = new Date("2026-09-20T09:30:00"); // 30 min before slot, cutoff is 24h
    expect(isPastCutoff(slotStart, 24, now)).toBe(true);
  });

  it("is false just before the cutoff boundary, true just after", () => {
    const justBefore = new Date("2026-09-19T09:59:59");
    const justAfter = new Date("2026-09-19T10:00:01");
    expect(isPastCutoff(slotStart, 24, justBefore)).toBe(false);
    expect(isPastCutoff(slotStart, 24, justAfter)).toBe(true);
  });

  it("respects a different cutoff window", () => {
    const now = new Date("2026-09-18T10:00:00"); // 2 days before
    expect(isPastCutoff(slotStart, 24, now)).toBe(false);
    expect(isPastCutoff(slotStart, 72, now)).toBe(true); // 3-day cutoff would already have passed
  });
});

// Regression coverage for a real bug: comparing starts_at (naive local
// wall-clock) against `new Date().toISOString()` (always UTC) let a slot
// that had already started still be listed as "available", and could shift
// the reschedule-link eligibility date by a day. These helpers must read
// local Date components (getFullYear/getHours/...), never UTC ones — the
// `new Date(y, m, d, h, min, s)` constructor below builds from local
// components regardless of the machine's own timezone, so this test is
// timezone-independent as long as both sides stay consistently "local".
describe("nowAsMysqlDateTime", () => {
  it("formats using local date/time components, not UTC", () => {
    const local = new Date(2026, 0, 15, 23, 30, 5); // Jan 15 2026, 23:30:05 local
    expect(nowAsMysqlDateTime(local)).toBe("2026-01-15 23:30:05");
  });

  it("pads single-digit month/day/hour/minute/second", () => {
    const local = new Date(2026, 8, 4, 9, 5, 3); // Sep 4 2026, 09:05:03 local
    expect(nowAsMysqlDateTime(local)).toBe("2026-09-04 09:05:03");
  });
});

describe("todayAsLocalDate", () => {
  it("returns just the date portion, in local time", () => {
    const local = new Date(2026, 8, 4, 23, 59, 0);
    expect(todayAsLocalDate(local)).toBe("2026-09-04");
  });
});
