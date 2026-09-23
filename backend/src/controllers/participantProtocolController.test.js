import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
vi.mock("../db/connection.js", () => ({
  default: {},
}));
vi.mock("../utils/logger.js", () => ({
  logToFile: vi.fn(),
}));
vi.mock("../utils/emailService.js", () => ({
  sendManualProtocolEmail: vi.fn(),
}));
vi.mock("../utils/assignmentHelper.js", () => ({
  assignProtocolToParticipant: vi.fn(),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { getParticipantProtocolView, importContactEvents } = await import("./participantProtocolController.js");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// These two endpoints are how a survey_agency user reads/writes fieldwork
// data — until now they had no project-membership check at all (any
// authenticated admin could request any project's data by ID). Coverage
// here mirrors the existing getProjectFieldwork checks in
// projectController.test.js.
describe("getParticipantProtocolView", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("skips the assignment check entirely for a master admin", async () => {
    executeQuery.mockResolvedValueOnce([{ participant_protocol_id: 1, project_id: 5 }]);
    const req = { query: { project_id: "5" }, admin: { id: 1, role: "master" } };
    const res = makeRes();

    await getParticipantProtocolView(req, res);

    expect(res.statusCode).toBe(200);
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it("requires project_id for a non-master caller", async () => {
    const req = { query: {}, admin: { id: 42, role: "survey_agency" } };
    const res = makeRes();

    await getParticipantProtocolView(req, res);

    expect(res.statusCode).toBe(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it("403s a survey_agency user who isn't assigned to the requested project", async () => {
    executeQuery.mockResolvedValueOnce([]); // user_projects lookup finds nothing
    const req = { query: { project_id: "5" }, admin: { id: 42, role: "survey_agency" } };
    const res = makeRes();

    await getParticipantProtocolView(req, res);

    expect(res.statusCode).toBe(403);
    expect(executeQuery).toHaveBeenCalledTimes(1); // never reached the view query
  });

  it("returns rows for a survey_agency user who is assigned to the project", async () => {
    executeQuery
      .mockResolvedValueOnce([{ 1: 1 }]) // assigned
      .mockResolvedValueOnce([{ participant_protocol_id: 1, project_id: 5 }]);
    const req = { query: { project_id: "5" }, admin: { id: 42, role: "survey_agency" } };
    const res = makeRes();

    await getParticipantProtocolView(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ participant_protocol_id: 1, project_id: 5 }]);
    const viewCall = executeQuery.mock.calls[1];
    expect(viewCall[0]).toMatch(/project_id = \?/);
  });
});

describe("importContactEvents", () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it("403s a survey_agency user who isn't assigned to the project they're importing into", async () => {
    executeQuery.mockResolvedValueOnce([]); // user_projects lookup finds nothing
    const req = {
      body: { project_id: 5, rows: [{ external_id: "P1", link_sent_at: "2026-09-01" }] },
      admin: { id: 42, role: "survey_agency" },
    };
    const res = makeRes();

    await importContactEvents(req, res);

    expect(res.statusCode).toBe(403);
    expect(executeQuery).toHaveBeenCalledTimes(1); // never reached the import loop
  });

  it("proceeds with the import for a survey_agency user assigned to the project", async () => {
    executeQuery
      .mockResolvedValueOnce([{ 1: 1 }]) // assigned
      .mockResolvedValueOnce([ // resolveParticipantProtocolId lookup
        { participant_protocol_id: 10, protocol_id: 1, max_session_id: null },
      ])
      .mockResolvedValueOnce({}); // the INSERT ... ON DUPLICATE KEY UPDATE
    const req = {
      body: { project_id: 5, rows: [{ external_id: "P1", link_sent_at: "2026-09-01" }] },
      admin: { id: 42, role: "survey_agency" },
    };
    const res = makeRes();

    await importContactEvents(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, updated: 1 });
  });

  it("skips the assignment check entirely for a master admin", async () => {
    executeQuery
      .mockResolvedValueOnce([ // resolveParticipantProtocolId lookup
        { participant_protocol_id: 10, protocol_id: 1, max_session_id: null },
      ])
      .mockResolvedValueOnce({}); // the INSERT ... ON DUPLICATE KEY UPDATE
    const req = {
      body: { project_id: 5, rows: [{ external_id: "P1", link_sent_at: "2026-09-01" }] },
      admin: { id: 1, role: "master" },
    };
    const res = makeRes();

    await importContactEvents(req, res);

    expect(res.statusCode).toBe(200);
    expect(executeQuery).toHaveBeenCalledTimes(2); // no membership-check query
  });
});
