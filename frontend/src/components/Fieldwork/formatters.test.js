import { describe, it, expect } from "vitest";
import {
  formatDateTime,
  formatWallClockDateTime,
  csvDateTime,
  csvUtcDateTime,
  timestampForFilename,
} from "./formatters";

// Expected values are built through the same local-time Date getters rather
// than hardcoded, so these pass in whatever timezone the test machine runs.
const pad = (n) => String(n).padStart(2, "0");
const localMysql = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

describe("timestampForFilename", () => {
  it("is UTC with a trailing Z, in the backend's filename format", () => {
    expect(timestampForFilename(new Date(Date.UTC(2026, 7, 31, 13, 38, 47)))).toBe("2026-08-31_13-38-47Z");
  });

  it("zero-pads every field", () => {
    expect(timestampForFilename(new Date(Date.UTC(2026, 0, 5, 1, 2, 3)))).toBe("2026-01-05_01-02-03Z");
  });
});

describe("csvUtcDateTime", () => {
  it("converts a UTC DB value to the exporter's local time", () => {
    expect(csvUtcDateTime("2026-08-31 13:38:47")).toBe(localMysql(new Date(Date.UTC(2026, 7, 31, 13, 38, 47))));
  });

  it("handles DATETIME(3) fractional seconds", () => {
    expect(csvUtcDateTime("2026-08-31 13:38:47.123")).toBe(localMysql(new Date(Date.UTC(2026, 7, 31, 13, 38, 47))));
  });

  it("leaves empty values empty and unparseable ones untouched", () => {
    expect(csvUtcDateTime(null)).toBe("");
    expect(csvUtcDateTime("not a date")).toBe("not a date");
  });
});

describe("wall-clock values (agency-entered contacted_at)", () => {
  it("csvDateTime passes them through unchanged, so they round-trip the import", () => {
    expect(csvDateTime("2026-09-01 10:30:00")).toBe("2026-09-01 10:30:00");
  });

  it("formatWallClockDateTime shows the same digits that were entered, no UTC shift", () => {
    const shown = formatWallClockDateTime("2026-09-01 10:30:00");
    const asEntered = new Date(2026, 8, 1, 10, 30).toLocaleString(undefined, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
    expect(shown).toBe(asEntered);
  });

  it("formatDateTime (UTC) and formatWallClockDateTime differ by the local offset", () => {
    const utcShown = formatDateTime("2026-09-01 10:30:00");
    const expected = new Date(Date.UTC(2026, 8, 1, 10, 30)).toLocaleString(undefined, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
    expect(utcShown).toBe(expected);
  });
});
