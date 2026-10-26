import { describe, it, expect } from "vitest";
import { isValidSiteName } from "./fieldValidation.js";

describe("isValidSiteName (F-008: free text, 1-64 characters)", () => {
  it.each([
    "Olomouc University Hospital",
    "Fakultní nemocnice Brno",
    "Paris",
    "a",
    "x".repeat(64),
    "  padded  ",
    "Klinika č. 3 (dětská)",
  ])("accepts %j", (name) => {
    expect(isValidSiteName(name)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["65 characters", "x".repeat(65)],
    ["65 after trimming only counts the trimmed text", "x".repeat(65) + "  "],
    ["null", null],
    ["undefined", undefined],
    ["a number", 123],
  ])("rejects %s", (_label, name) => {
    expect(isValidSiteName(name)).toBe(false);
  });

  it("trims before measuring", () => {
    expect(isValidSiteName(` ${"x".repeat(64)} `)).toBe(true);
  });

});
