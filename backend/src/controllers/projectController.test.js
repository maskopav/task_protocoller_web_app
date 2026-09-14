import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { getProjectList, getProjectFieldwork } = await import("./projectController.js");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// Regression coverage for a real authorization bug: scoping used to be
// decided by req.query.userId/role (client-supplied, trivially spoofable)
// instead of req.admin (set by authMiddleware.requireAuth from the verified
// JWT). A logged-in but non-master admin could add ?role=master to the
// request and see every project instead of just their assigned ones.
describe("getProjectList", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("runs the unfiltered query for a master admin, ignoring any query params", async () => {
    executeQuery.mockResolvedValueOnce([{ project_id: 1 }, { project_id: 2 }]);
    const req = { admin: { id: 99, role: "master" }, query: { role: "editor", userId: "1" } };
    const res = makeRes();

    await getProjectList(req, res);

    expect(executeQuery).toHaveBeenCalledWith("SELECT * FROM v_project_summary_stats", []);
    expect(res.body).toEqual([{ project_id: 1 }, { project_id: 2 }]);
  });

  it("scopes to assigned projects for a non-master admin, using req.admin.id not any client-supplied id", async () => {
    executeQuery.mockResolvedValueOnce([{ project_id: 1 }]);
    const req = { admin: { id: 7, role: "editor" }, query: { role: "master", userId: "999" } };
    const res = makeRes();

    await getProjectList(req, res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN user_projects/);
    expect(params).toEqual([7]);
  });
});

describe("getProjectFieldwork", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("403s a non-master admin who isn't assigned to the requested project", async () => {
    executeQuery.mockResolvedValueOnce([]); // user_projects lookup finds nothing
    const req = { params: { projectId: "5" }, admin: { id: 7, role: "editor" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(403);
    expect(executeQuery).toHaveBeenCalledTimes(1); // never reached the fieldwork query
  });

  it("returns fieldwork rows for a non-master admin who is assigned to the project", async () => {
    executeQuery
      .mockResolvedValueOnce([{ 1: 1 }]) // assigned
      .mockResolvedValueOnce([{ session_id: 1, project_id: 5 }]);
    const req = { params: { projectId: "5" }, admin: { id: 7, role: "editor" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ session_id: 1, project_id: 5 }]);
    const fieldworkCall = executeQuery.mock.calls[1];
    expect(fieldworkCall[0]).toMatch(/FROM v_session_summary WHERE project_id = \?/);
    expect(fieldworkCall[1]).toEqual(["5"]);
  });

  it("skips the assignment check entirely for a master admin", async () => {
    executeQuery.mockResolvedValueOnce([{ session_id: 1, project_id: 5 }]);
    const req = { params: { projectId: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getProjectFieldwork(req, res);

    expect(res.statusCode).toBe(200);
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });
});
