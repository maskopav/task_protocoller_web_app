import { describe, expect, it } from "vitest";
import { addableStudies, entryTaskCategories, variantId } from "./libraryHelpers";

describe("addableStudies", () => {
  it("keeps editable, active studies", () => {
    const rows = [
      { project_id: 1, can_edit: true, project_is_active: 1 },
      { project_id: 2, can_edit: false, project_is_active: 1 },
      { project_id: 3, can_edit: true, project_is_active: 0 },
      { project_id: 4, can_edit: true },
    ];
    expect(addableStudies(rows).map((s) => s.project_id)).toEqual([1, 4]);
  });
  it("tolerates a non-array", () => {
    expect(addableStudies(null)).toEqual([]);
  });
});

describe("entryTaskCategories", () => {
  const mappings = { tasks: [{ id: 10, category: "video" }, { id: 11, category: "speech" }] };
  it("orders by task_order and nulls unknown ids", () => {
    const entry = { tasks: [{ task_id: 11, task_order: 2 }, { task_id: 10, task_order: 1 }, { task_id: 99, task_order: 3 }] };
    expect(entryTaskCategories(entry, mappings)).toEqual(["video", "speech", null]);
  });
  it("returns an empty list without tasks", () => {
    expect(entryTaskCategories({}, mappings)).toEqual([]);
  });
});

describe("variantId", () => {
  it("reads the protocol id of a language", () => {
    expect(variantId({ protocol_ids: { en: 4 } }, "en")).toBe(4);
    expect(variantId({ protocol_ids: { en: 4 } }, "cs")).toBeNull();
  });
});
