import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
vi.mock("../utils/assignmentHelper.js", () => ({
  assignProtocolToParticipant: vi.fn(),
}));
vi.mock("../utils/logger.js", () => ({
  logToFile: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import("../db/queryHelper.js");
const { assignProtocolToParticipant } = await import("../utils/assignmentHelper.js");
const { bulkImportParticipants } = await import("./participantController.js");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(payload) { this.body = payload; return this; },
  };
}

function makeReq({ file, project_id = "1", protocol_id = "2", referer = "https://app.example/study/" } = {}) {
  return {
    file,
    body: { project_id, protocol_id },
    headers: { referer },
  };
}

// Drives conn.query by matching on a substring of the SQL, same idiom as
// assignmentHelper.test.js's makeConn -- lets each test only describe the
// branches it actually exercises.
function makeConn(responses) {
  return {
    query: vi.fn((sql) => {
      for (const [match, result] of responses) {
        if (sql.includes(match)) return Promise.resolve(result);
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}

const csvFile = (content) => ({ buffer: Buffer.from(content, "utf8") });

describe("bulkImportParticipants", () => {
  beforeEach(() => {
    executeQuery.mockReset();
    executeTransaction.mockReset();
    assignProtocolToParticipant.mockReset();
  });

  it("400s when no file was uploaded", async () => {
    const req = makeReq({ file: undefined });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Missing CSV file/);
  });

  it("400s when project_id or protocol_id is missing", async () => {
    const req = makeReq({ file: csvFile("EXT-1"), project_id: "" });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Missing project_id or protocol_id/);
  });

  it("403s for an inactive project, without touching the file", async () => {
    executeQuery.mockResolvedValueOnce([{ is_active: 0 }]);
    const req = makeReq({ file: csvFile("EXT-1") });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(res.statusCode).toBe(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it("400s when the CSV has no external_id values (header-only or empty)", async () => {
    executeQuery.mockResolvedValueOnce([{ is_active: 1 }]);
    const req = makeReq({ file: csvFile("external_id\n") });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no external_id values/);
  });

  it("creates a participant and a fresh assignment for a new external_id", async () => {
    executeQuery.mockResolvedValueOnce([{ is_active: 1 }]);
    const conn = makeConn([
      ["SELECT id FROM participants", [[]]],
      ["INSERT INTO participants", [{ insertId: 10 }]],
      ["FROM participant_protocols pp", [[]]], // no existing assignment
    ]);
    executeTransaction.mockImplementation((cb) => cb(conn));
    assignProtocolToParticipant.mockResolvedValueOnce({ participant_protocol_id: 99, unique_token: "tok-abc" });

    const req = makeReq({ file: csvFile("external_id\nEXT-1") });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(assignProtocolToParticipant).toHaveBeenCalledWith(conn, 10, "1", "2");
    expect(res.headers["Content-Type"]).toMatch(/text\/csv/);
    expect(res.body).toContain("EXT-1");
    expect(res.body).toContain("10");
    expect(res.body).toContain("https://app.example/study/#/participant/tok-abc");
    expect(res.body).toContain("imported");
  });

  it("reuses an existing participant and an existing usable token instead of creating a new one", async () => {
    executeQuery.mockResolvedValueOnce([{ is_active: 1 }]);
    const conn = makeConn([
      ["SELECT id FROM participants", [[{ id: 5 }]]],
      ["FROM participant_protocols pp", [[{ id: 50, access_token: "tok-xyz" }]]],
      ["UPDATE participant_protocols", [{}]],
    ]);
    executeTransaction.mockImplementation((cb) => cb(conn));

    const req = makeReq({ file: csvFile("EXT-1") });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(assignProtocolToParticipant).not.toHaveBeenCalled();
    expect(res.body).toContain("tok-xyz");
    expect(res.body).toContain("imported");
  });

  it("skips a blank row and a duplicate external_id without hitting the database", async () => {
    executeQuery.mockResolvedValueOnce([{ is_active: 1 }]);
    const conn = makeConn([
      ["SELECT id FROM participants", [[]]],
      ["INSERT INTO participants", [{ insertId: 1 }]],
      ["FROM participant_protocols pp", [[]]],
    ]);
    executeTransaction.mockImplementation((cb) => cb(conn));
    assignProtocolToParticipant.mockResolvedValueOnce({ participant_protocol_id: 1, unique_token: "tok-1" });

    const req = makeReq({ file: csvFile("EXT-1\n,\nEXT-1") }); // "," -> a blank first column, not a blank line
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(executeTransaction).toHaveBeenCalledTimes(1); // only the first EXT-1 hits the DB
    expect(res.body).toContain("Empty external_id");
    expect(res.body).toContain("Duplicate external_id in file");
  });

  it("records a per-row error and keeps processing the rest of the file", async () => {
    executeQuery.mockResolvedValueOnce([{ is_active: 1 }]);
    executeTransaction
      .mockImplementationOnce(() => Promise.reject(new Error("boom")))
      .mockImplementationOnce((cb) => cb(makeConn([
        ["SELECT id FROM participants", [[]]],
        ["INSERT INTO participants", [{ insertId: 2 }]],
        ["FROM participant_protocols pp", [[]]],
      ])));
    assignProtocolToParticipant.mockResolvedValueOnce({ participant_protocol_id: 2, unique_token: "tok-2" });

    const req = makeReq({ file: csvFile("EXT-BAD\nEXT-OK") });
    const res = makeRes();

    await bulkImportParticipants(req, res);

    expect(res.body).toContain("EXT-BAD");
    expect(res.body).toContain("boom");
    expect(res.body).toContain("EXT-OK");
    expect(res.body).toContain("tok-2");
  });
});
