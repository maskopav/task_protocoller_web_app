import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/protocols", () => ({ getProtocolById: vi.fn() }));

import { getProtocolById } from "../../api/protocols";
import { loadMappedProtocol } from "./protocolMapping";

const mappings = {
  languages: [{ id: 2, code: "en" }],
  tasks: [{ id: 5, category: "reading" }],
};

describe("loadMappedProtocol", () => {
  beforeEach(() => { getProtocolById.mockReset(); });

  it("loads by id and maps language and task names", async () => {
    getProtocolById.mockResolvedValue({ id: 7, name: "P", language_id: 2, tasks: [{ task_id: 5, task_order: 1, params: { x: 1 } }] });
    const p = await loadMappedProtocol(7, mappings);
    expect(getProtocolById).toHaveBeenCalledWith(7);
    expect(p).toMatchObject({ id: 7, name: "P", language: "en", tasks: [{ category: "reading", x: 1, task_order: 1 }] });
  });

  it("marks a questionnaire task whose params lack a type", async () => {
    getProtocolById.mockResolvedValue({ id: 7, language_id: 2, tasks: [{ task_id: 6, task_order: 1, params: { title: "Q" } }] });
    const p = await loadMappedProtocol(7, {
      ...mappings,
      tasks: [{ id: 6, category: "questionnaire", type_id: 4 }],
      task_types: [{ id: 4, type: "questionnaire" }],
    });
    expect(p.tasks[0]).toMatchObject({ type: "questionnaire", category: "questionnaire", title: "Q" });
  });

  it("throws when the mappings are not loaded", async () => {
    getProtocolById.mockResolvedValue({ id: 7, tasks: [] });
    await expect(loadMappedProtocol(7, {})).rejects.toThrow("protocol_load_failed");
  });

  it("propagates a load error", async () => {
    getProtocolById.mockRejectedValue(new Error("404"));
    await expect(loadMappedProtocol(7, mappings)).rejects.toThrow("404");
  });
});
