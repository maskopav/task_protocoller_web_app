import { describe, it, expect } from "vitest";
import { fmtBytes, fmtClock, fmtDur, fmtDurShort, endOf, lagParts, relParts, shortId, prettyName, isoDay, fmtDate, fmtTime } from "./format";

describe("upload formatters", () => {
  it("formats durations", () => {
    expect(fmtDur(908)).toBe("15 min 08 s");
    expect(fmtDur(3725)).toBe("1 h 02 min");
    expect(fmtDurShort(908)).toBe("15 min");
    expect(fmtDurShort(5400)).toBe("1:30 h");
    expect(fmtDur(null)).toBe("—");
    expect(fmtClock(65)).toBe("1:05");
  });

  it("formats byte sizes", () => {
    expect(fmtBytes(47450)).toBe("47 kB");
    expect(fmtBytes(12_345_678)).toBe("12.3 MB");
    expect(fmtBytes(2_500_000_000)).toBe("2.50 GB");
  });

  it("formats dates in local time", () => {
    const iso = new Date(2026, 9, 13, 8, 5).toISOString();
    expect(fmtDate(iso)).toBe("13. 10. 2026");
    expect(fmtTime(iso)).toBe("08:05");
    expect(fmtDate(null)).toBe("—");
  });

  it("falls back to processedAt when the session never ended", () => {
    expect(endOf({ endedAt: null, processedAt: "p" })).toBe("p");
    expect(endOf({ endedAt: "e", processedAt: "p" })).toBe("e");
  });

  it("picks the lag unit", () => {
    const mk = (hours) => ({ endedAt: "2026-10-01T00:00:00Z", receivedAt: new Date(Date.parse("2026-10-01T00:00:00Z") + hours * 3600e3).toISOString() });
    expect(lagParts(mk(0.5))).toEqual({ unit: "min", n: 30 });
    expect(lagParts(mk(5))).toEqual({ unit: "h", n: 5 });
    expect(lagParts(mk(72))).toEqual({ unit: "days", n: 3 });
  });

  it("describes relative times", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(relParts("2026-10-22T11:30:00Z", now)).toEqual({ unit: "min", n: 30 });
    expect(relParts("2026-10-22T07:00:00Z", now)).toEqual({ unit: "h", n: 5 });
    expect(relParts("2026-10-21T12:00:00Z", now)).toEqual({ unit: "yesterday", n: 1 });
    expect(relParts("2026-10-19T12:00:00Z", now)).toEqual({ unit: "days", n: 3 });
  });

  it("shortens ids and prettifies task names", () => {
    expect(shortId("b1293ecf1f10e5a673976e1e9c82ad6a")).toBe("b1293ecf…");
    expect(shortId("short")).toBe("short");
    expect(prettyName("MAX_PHONATION_TIME")).toBe("Max phonation time");
  });

  it("builds local yyyy-mm-dd days", () => {
    expect(isoDay(7, new Date(2026, 9, 22))).toBe("2026-10-15");
    expect(isoDay(0, new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});
