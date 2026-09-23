import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../controllers/projectController.js", () => ({
  getProjectList: (req, res) => res.json({ ok: true }),
  getProjectFieldwork: (req, res) => res.json({ ok: true }),
  createProject: (req, res) => res.json({ ok: true }),
  updateProject: (req, res) => res.json({ ok: true }),
}));

vi.mock("../middleware/authMiddleware.js", async () => {
  const actual = await vi.importActual("../middleware/authMiddleware.js");
  return {
    ...actual,
    requireAuth: (req, res, next) => {
      const role = req.headers["x-test-role"];
      if (!role) return res.status(401).json({ error: "Unauthorized" });
      req.admin = { id: 1, role };
      next();
    },
  };
});

const { default: router } = await import("./projects.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe("projects routes — role gating", () => {
  it("GET /projects-list is reachable for survey_agency", async () => {
    const app = buildApp();
    const res = await request(app).get("/projects-list").set("x-test-role", "survey_agency");
    expect(res.status).toBe(200);
  });

  it("GET /:projectId/fieldwork is reachable for survey_agency", async () => {
    const app = buildApp();
    const res = await request(app).get("/5/fieldwork").set("x-test-role", "survey_agency");
    expect(res.status).toBe(200);
  });

  it("POST /create is blocked for survey_agency", async () => {
    const app = buildApp();
    const res = await request(app).post("/create").set("x-test-role", "survey_agency").send({});
    expect(res.status).toBe(403);
  });

  it("POST /create is reachable for admin", async () => {
    const app = buildApp();
    const res = await request(app).post("/create").set("x-test-role", "admin").send({});
    expect(res.status).toBe(200);
  });

  it("PUT /update is blocked for survey_agency", async () => {
    const app = buildApp();
    const res = await request(app).put("/update").set("x-test-role", "survey_agency").send({});
    expect(res.status).toBe(403);
  });
});
