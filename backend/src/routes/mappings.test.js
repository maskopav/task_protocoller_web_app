import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../db/connection.js", () => ({
  default: { query: vi.fn().mockResolvedValue([[{ id: 1 }]]) },
}));

const { default: pool } = await import("../db/connection.js");
const { default: mappingsRouter } = await import("./mappings.js");

function makeApp() {
  const app = express();
  app.use("/mappings", mappingsRouter);
  return app;
}

// Regression coverage: v_session_summary and v_project_summary_stats used
// to be in ALLOWED_TABLES on this deliberately unauthenticated router,
// which meant anyone (no login) could pull every participant's session
// data / every project's stats across the whole system with an unfiltered
// SELECT *. They're now served only by the authenticated, project-scoped
// endpoints in projectController.js — see projectController.test.js.
describe("GET /mappings", () => {
  it("rejects the two PII/stats-bearing views that used to be public", async () => {
    const app = makeApp();

    const sessionSummary = await request(app).get("/mappings?tables=v_session_summary");
    expect(sessionSummary.status).toBe(400);
    expect(sessionSummary.body.error).toMatch(/Unknown table/);

    const stats = await request(app).get("/mappings?tables=v_project_summary_stats");
    expect(stats.status).toBe(400);
    expect(stats.body.error).toMatch(/Unknown table/);

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("still serves genuinely public lookup tables", async () => {
    const app = makeApp();
    const res = await request(app).get("/mappings?tables=protocols,languages");

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith("SELECT * FROM `protocols`");
    expect(pool.query).toHaveBeenCalledWith("SELECT * FROM `languages`");
  });
});
