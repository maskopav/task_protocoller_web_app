import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
}));
vi.mock("bcrypt", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed") },
}));
vi.mock("../utils/logger.js", () => ({
  logToFile: vi.fn(),
}));
vi.mock("../utils/emailService.js", () => ({
  sendAdminWelcomeEmail: vi.fn().mockResolvedValue(true),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { createAdmin } = await import("./userController.js");

function makeReq(body) {
  return { body, headers: {} };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// POST /users/create is master-only (see users.js), but master should still
// only be able to hand out roles that make sense to create this way —
// "admin" (existing behavior) or the new "survey_agency". Never "master"
// itself, which would turn this endpoint into a privilege-escalation path.
describe("createAdmin", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("defaults to the admin role when none is specified (existing behavior)", async () => {
    executeQuery
      .mockResolvedValueOnce([]) // no existing user with this email
      .mockResolvedValueOnce([{ id: 2 }]) // roles lookup
      .mockResolvedValueOnce({ insertId: 10 }); // INSERT INTO users
    const req = makeReq({ email: "a@example.com", full_name: "A" });
    const res = makeRes();

    await createAdmin(req, res);

    expect(res.statusCode).toBe(201);
    const rolesCall = executeQuery.mock.calls[1];
    expect(rolesCall[1]).toEqual(["admin"]);
  });

  it("creates a survey_agency user when role: 'survey_agency' is given", async () => {
    executeQuery
      .mockResolvedValueOnce([]) // no existing user
      .mockResolvedValueOnce([{ id: 3 }]) // roles lookup for survey_agency
      .mockResolvedValueOnce({ insertId: 11 }); // INSERT INTO users
    const req = makeReq({ email: "agency@example.com", full_name: "Agency", role: "survey_agency" });
    const res = makeRes();

    await createAdmin(req, res);

    expect(res.statusCode).toBe(201);
    const rolesCall = executeQuery.mock.calls[1];
    expect(rolesCall[1]).toEqual(["survey_agency"]);
    const insertCall = executeQuery.mock.calls[2];
    expect(insertCall[1]).toContain(3); // role_id from the roles lookup
  });

  it("rejects role: 'master' without touching the database", async () => {
    const req = makeReq({ email: "wannabe@example.com", full_name: "X", role: "master" });
    const res = makeRes();

    await createAdmin(req, res);

    expect(res.statusCode).toBe(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized role string", async () => {
    const req = makeReq({ email: "x@example.com", full_name: "X", role: "superuser" });
    const res = makeRes();

    await createAdmin(req, res);

    expect(res.statusCode).toBe(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});
