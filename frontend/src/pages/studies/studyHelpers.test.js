import { describe, it, expect } from "vitest";
import {
  groupStudies, languageCodes, protocolNameTaken, blankProtocolDraft, duplicateDraft,
  defaultLanguage, clinicRows, canRemoveEditor, yesNo, isArchived,
} from "./studyHelpers";

const rows = [
  { project_id: 1, project_name: "Alpha", description: "voice", project_is_active: 1, can_edit: true },
  { project_id: 2, project_name: "Beta", project_is_active: 1, can_edit: false },
  { project_id: 3, project_name: "Old", project_is_active: 0, can_edit: true },
];

describe("groupStudies", () => {
  it("splits yours and received for a member, hiding archived", () => {
    const g = groupStudies(rows, { isMaster: false });
    expect(g.yours.map((s) => s.project_id)).toEqual([1]);
    expect(g.received.map((s) => s.project_id)).toEqual([2]);
  });
  it("gives a master one group and shows archived on request", () => {
    expect(groupStudies(rows, { isMaster: true }).all).toHaveLength(2);
    expect(groupStudies(rows, { isMaster: true, showArchived: true }).all).toHaveLength(3);
  });
  it("filters by name or description", () => {
    expect(groupStudies(rows, { isMaster: true, query: "VOI" }).all.map((s) => s.project_id)).toEqual([1]);
  });
  it("isArchived reads either flag name", () => {
    expect(isArchived(rows[2])).toBe(true);
    expect(isArchived({ is_active: 0 })).toBe(true);
    expect(isArchived({})).toBe(false);
  });
});

describe("protocols", () => {
  it("collects language chips once", () => {
    expect(languageCodes([{ languages: [{ code: "cs" }, { code: "en" }] }, { languages: [{ code: "en" }] }])).toEqual(["cs", "en"]);
  });
  it("detects a taken name case-insensitively", () => {
    expect(protocolNameTaken("  speech BATTERY ", [{ name: "Speech battery" }])).toBe(true);
    expect(protocolNameTaken("", [{ name: "" }])).toBe(false);
  });
  it("a blank draft has the patient code identifier and the file-name template (F-006)", () => {
    const d = blankProtocolDraft({ name: " X ", language: "cs" });
    expect(d.name).toBe("X");
    expect(d.language).toEqual(["cs"]);
    expect(d.required_identifiers.map((f) => f.name)).toEqual(["patient_code"]);
    expect(d.required_identifiers[0].required).toBe(true);
    expect(d.recordings_file_name).toContain("${field.patient_code}");
    expect(d.recordings_file_name).toContain("${taskIndex}");
  });
  it("a duplicate loses its ids and restarts at version 1", () => {
    const d = duplicateDraft({ id: 5, protocol_group_id: 5, version: 4, name: "A", language: "en", tasks: [1] }, "A (copy)");
    expect(d).toMatchObject({ id: undefined, protocol_group_id: undefined, version: 1, name: "A (copy)", language: ["en"] });
  });
  it("picks the UI language when offered", () => {
    expect(defaultLanguage("cs-CZ", ["en", "cs"])).toBe("cs");
    expect(defaultLanguage("fr", ["en", "cs"])).toBe("en");
    expect(defaultLanguage("de", [])).toBe("de");
  });
});

describe("clinicRows / editors / yesNo", () => {
  it("lists running clinics first and builds subtitles", () => {
    const r = clinicRows([{ id: 1, name: "B" }, { id: 2, name: "A" }, { id: 3, name: "C" }], [3], { 3: 4 }, { subtitle: (n) => `${n} rec` });
    expect(r.map((x) => x.key)).toEqual([3, 2, 1]);
    expect(r[0]).toMatchObject({ on: true, subtitle: "4 rec" });
    expect(r[1].on).toBe(false);
  });
  it("never removes the creator or the last editor", () => {
    const two = [{ user_id: 1, is_creator: true }, { user_id: 2 }];
    expect(canRemoveEditor(two[0], two)).toBe(false);
    expect(canRemoveEditor(two[1], two)).toBe(true);
    expect(canRemoveEditor({ user_id: 2 }, [{ user_id: 2 }])).toBe(false);
  });
  it("shows booleans as Yes/No (F-007)", () => {
    const t = (k) => ({ yes: "Yes", no: "No" }[k]);
    expect(yesNo(true, t)).toBe("Yes");
    expect(yesNo(false, t)).toBe("No");
    expect(yesNo("false", t)).toBe("No");
    expect(yesNo(5, t)).toBe(5);
  });
});
