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

  it("throws when the mappings are not loaded", async () => {
    getProtocolById.mockResolvedValue({ id: 7, tasks: [] });
    await expect(loadMappedProtocol(7, {})).rejects.toThrow("protocol_load_failed");
  });

  it("propagates a load error", async () => {
    getProtocolById.mockRejectedValue(new Error("404"));
    await expect(loadMappedProtocol(7, mappings)).rejects.toThrow("404");
  });
});
