import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "./csv.js";

describe("csv", () => {
  it("passes plain values and nulls", () => {
    expect(csvCell("abc")).toBe("abc");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });
  it("quotes separators, quotes and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx"])("neutralises %j", (v) => {
    expect(csvCell(v).startsWith("'") || csvCell(v).startsWith('"\'')).toBe(true);
  });
  it("formats dates as ISO", () => {
    expect(csvCell(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });
  it("joins rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});
