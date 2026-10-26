import { describe, it, expect } from "vitest";
import {
  MAX_BUNDLE_BYTES, MAX_BUNDLE_SESSIONS, blockedReason, checkBundleLimits, downloadTarget, downloadableFromFilter, isBulkSelectable,
} from "./bulk";

const row = (o = {}) => ({ id: "a", canEdit: true, status: "valid", qc: "unreviewed", issues: [], bytes: 10, ...o });

describe("blockedReason / isBulkSelectable", () => {
  it("allows editable valid rows", () => expect(blockedReason(row())).toBeNull());
  it("blocks read-only and validating rows", () => {
    expect(blockedReason(row({ canEdit: false }))).toBe("readOnly");
    expect(blockedReason(row({ status: "validating" }))).toBe("validating");
  });
  it("lets invalid rows be ticked one by one but not by select-all", () => {
    expect(blockedReason(row({ status: "invalid" }))).toBeNull();
    expect(isBulkSelectable(row({ status: "invalid" }))).toBe(false);
    expect(isBulkSelectable(row())).toBe(true);
  });
});

describe("checkBundleLimits", () => {
  it("passes at the limits", () => {
    const rows = Array.from({ length: MAX_BUNDLE_SESSIONS }, (_, i) => row({ bytes: i === 0 ? MAX_BUNDLE_BYTES : 0 }));
    expect(checkBundleLimits(rows).ok).toBe(true);
  });
  it("refuses more than 200 sessions or 5 GB", () => {
    expect(checkBundleLimits(Array.from({ length: MAX_BUNDLE_SESSIONS + 1 }, () => row()))).toMatchObject({ ok: false, reason: "tooMany" });
    expect(checkBundleLimits([row({ bytes: MAX_BUNDLE_BYTES }), row({ bytes: 1 })])).toMatchObject({ ok: false, reason: "tooLarge" });
  });
  it("sums bytes", () => expect(checkBundleLimits([row({ bytes: 5 }), row({ bytes: 7 })]).bytes).toBe(12));
});

describe("what the Download button acts on", () => {
  it("is the ticked rows when something is ticked", () => {
    expect(downloadTarget([row({ id: "x" }), row({ id: "y", status: "invalid" })])).toEqual({ mode: "selection", ids: ["x", "y"] });
  });
  it("drops ticked rows that cannot be downloaded", () => {
    expect(downloadTarget([row({ id: "x" }), row({ id: "z", canEdit: false })]).ids).toEqual(["x"]);
  });
  it("is the whole filter when nothing is ticked", () => {
    expect(downloadTarget([])).toEqual({ mode: "filter", ids: [] });
  });
  it("downloads a filter without invalid, validating and read-only rows", () => {
    const rows = [row({ id: "1" }), row({ id: "2", status: "invalid" }), row({ id: "3", status: "validating" }), row({ id: "4", canEdit: false })];
    expect(downloadableFromFilter(rows).map((r) => r.id)).toEqual(["1"]);
  });
});
