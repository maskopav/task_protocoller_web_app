import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
vi.mock("../utils/logger.js", () => ({ logToFile: vi.fn() }));

const { executeQuery } = await import("../db/queryHelper.js");
const { getProtocolsByProjectId } = await import("./protocolController.js");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// The unscoped list backs the protocol manager's "protocols from other
// projects" section (for duplicating a protocol into a new project), so a
// non-master admin must only get protocols of projects assigned to them.
describe("getProtocolsByProjectId", () => {
  beforeEach(() => {
    executeQuery.mockReset();
    executeQuery.mockResolvedValue([]);
  });

  it("filters by project_id when given", async () => {
    const req = { admin: { id: 7, role: "admin" }, query: { project_id: "3" } };
    await getProtocolsByProjectId(req, makeRes());

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE project_id = \?/);
    expect(params).toEqual(["3"]);
  });

  it("returns every project's protocols to a master admin", async () => {
    const req = { admin: { id: 1, role: "master" }, query: {} };
    await getProtocolsByProjectId(req, makeRes());

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).not.toMatch(/user_projects/);
    expect(params).toEqual([]);
  });

  it("scopes the unfiltered list to assigned projects for a non-master admin", async () => {
    const req = { admin: { id: 7, role: "admin" }, query: {} };
    await getProtocolsByProjectId(req, makeRes());

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN user_projects/);
    expect(params).toEqual([7]);
  });
});
