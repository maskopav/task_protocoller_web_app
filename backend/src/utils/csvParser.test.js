import { describe, it, expect } from "vitest";
import { parseExternalIdsCsv } from "./csvParser.js";

const buf = (str) => Buffer.from(str, "utf8");

describe("parseExternalIdsCsv", () => {
  it("strips a matching header row (case-insensitive)", () => {
    expect(parseExternalIdsCsv(buf("External_ID\nEXT-1\nEXT-2"))).toEqual(["EXT-1", "EXT-2"]);
  });

  it("treats the first row as data when it isn't a header", () => {
    expect(parseExternalIdsCsv(buf("EXT-1\nEXT-2"))).toEqual(["EXT-1", "EXT-2"]);
  });

  it("skips blank lines", () => {
    expect(parseExternalIdsCsv(buf("EXT-1\n\n   \nEXT-2\n"))).toEqual(["EXT-1", "EXT-2"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseExternalIdsCsv(buf("external_id\r\nEXT-1\r\nEXT-2\r\n"))).toEqual(["EXT-1", "EXT-2"]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseExternalIdsCsv(buf("﻿external_id\nEXT-1"))).toEqual(["EXT-1"]);
  });

  it("only reads the first column, ignoring any extra columns", () => {
    expect(parseExternalIdsCsv(buf("external_id,name\nEXT-1,Jane Doe"))).toEqual(["EXT-1"]);
  });

  it("unquotes a quoted value and unescapes doubled quotes", () => {
    expect(parseExternalIdsCsv(buf('external_id\n"EXT-1"\n"EXT-""2"""'))).toEqual(["EXT-1", 'EXT-"2"']);
  });

  it("returns an empty array for an empty file", () => {
    expect(parseExternalIdsCsv(buf(""))).toEqual([]);
  });

  it("preserves a blank value on an otherwise non-blank line (e.g. a trailing comma)", () => {
    expect(parseExternalIdsCsv(buf("external_id\n,extra"))).toEqual([""]);
  });
});
