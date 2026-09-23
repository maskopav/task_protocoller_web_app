import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// Route-wiring test: does each endpoint have the right role gate? Controller
// behavior itself is covered in participantProtocolController.test.js, so
// every controller here is a stub — only middleware matters for these cases.
vi.mock("../controllers/participantProtocolController.js", () => ({
  resolveParticipantToken: (req, res) => res.json({ ok: true }),
  getParticipantProtocolView: (req, res) => res.json({ ok: true }),
  getParticipantProtocolViewById: (req, res) => res.json({ ok: true }),
  activateParticipantProtocol: (req, res) => res.json({ ok: true }),
  deactivateParticipantProtocol: (req, res) => res.json({ ok: true }),
  assignProtocol: (req, res) => res.json({ ok: true }),
  sendManualEmail: (req, res) => res.json({ ok: true }),
  swapParticipantProtocolLanguage: (req, res) => res.json({ ok: true }),
  importContactEvents: (req, res) => res.json({ ok: true }),
}));

// Stand in for requireAuth: real requireAuth re-checks the DB, which this
// route-wiring test has no need to exercise. Role comes from a test-only
// header so each request can act as a different user.
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

const { default: router } = await import("./participantProtocols.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe("participantProtocols routes — role gating", () => {
  const writeRoutes = [
    ["post", "/activate"],
    ["post", "/deactivate"],
    ["post", "/assign"],
    ["post", "/send-manual-email"],
  ];

  for (const [method, path] of writeRoutes) {
    it(`${method.toUpperCase()} ${path} is blocked for survey_agency`, async () => {
      const app = buildApp();
      const res = await request(app)[method](path).set("x-test-role", "survey_agency").send({});
      expect(res.status).toBe(403);
    });

    it(`${method.toUpperCase()} ${path} is reachable for admin`, async () => {
      const app = buildApp();
      const res = await request(app)[method](path).set("x-test-role", "admin").send({});
      expect(res.status).toBe(200);
    });
  }

  it("GET / (fieldwork view) is reachable for survey_agency", async () => {
    const app = buildApp();
    const res = await request(app).get("/").set("x-test-role", "survey_agency");
    expect(res.status).toBe(200);
  });

  it("POST /import-contacts is reachable for survey_agency", async () => {
    const app = buildApp();
    const res = await request(app).post("/import-contacts").set("x-test-role", "survey_agency").send({});
    expect(res.status).toBe(200);
  });
});
