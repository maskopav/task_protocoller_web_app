// MCP read tools end to end against a real MariaDB (docs/mcp/01_spec.md
// section 8, tests 4, 5 and 7): JSON-RPC over the real /mcp router, rights
// parity with the web API, and no participant data in any tool result.
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";

process.env.JWT_SECRET ||= "test-secret";

const hold = { q: null };
vi.mock("../../src/db/queryHelper.js", () => ({
  executeQuery: (sql, params = []) => hold.q(sql, params),
  executeTransaction: async (cb) => cb({ query: async (sql, params = []) => [await hold.q(sql, params)] }),
}));
vi.mock("../../src/utils/logger.js", () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const dbUp = await testDbAvailable();
afterAll(closeTestDb);
const { createMcpRouter } = await import("../../src/mcp/router.js");
const { generatePat } = await import("../../src/utils/pat.js");
const { logToFile } = await import("../../src/utils/logger.js");

const pass = (req, res, next) => next();
let app;
beforeAll(() => {
  app = express();
  app.use("/mcp", createMcpRouter({ authLimiter: pass, callLimiter: pass }));
});

// Every value here must never appear in any tool result.
const SENTINELS = {
  surname: "SENT_SURNAME_Novak",
  birth: "SENT_BIRTH_1950",
  clip: "SENT_CLIP_Novak.wav",
  video: "SENT_VIDEO_Novak.mp4",
  answer: "SENT_ANSWER_lives_in_Brno",
  check: "SENT_ZIPENTRY_Novak",
  take: "SENT_TAKE_Novak",
  hardware: "SENT_HW_serial",
  edited: "SENT_EDITED_FIELD",
  interruption: "SENT_INTERRUPTION",
};

let rpcId = 0;
const rpc = (token, method, params = {}) =>
  request(app).post("/mcp")
    .set({ Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" })
    .send({ jsonrpc: "2.0", id: ++rpcId, method, params });

async function tool(token, name, args = {}) {
  const res = await rpc(token, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const r = res.body.result;
  const text = r.content[0].text;
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { isError: !!r.isError, body, raw: res.text };
}

async function world(q) {
  const t = crypto.randomBytes(4).toString("hex");
  const roleId = async (n) => (await q(`SELECT id FROM roles WHERE name = ?`, [n]))[0].id;
  const tokens = {};
  const user = async (key, roleName, { technical = 0 } = {}) => {
    const id = Number((await q(
      `INSERT INTO users (email, password_hash, role_id, can_use_mcp, can_see_technical, full_name) VALUES (?, 'x', ?, 1, ?, ?)`,
      [`${key}-${t}@mcpread.test`, await roleId(roleName), technical, `User ${key}`]
    )).insertId);
    const p = generatePat();
    await q(
      `INSERT INTO personal_access_tokens (user_id, name, token_prefix, token_hash, token_version, expires_at)
       VALUES (?, 'test', ?, ?, 0, UTC_TIMESTAMP() + INTERVAL 1 DAY)`,
      [id, p.prefix, p.hash]
    );
    tokens[key] = p.token;
    return id;
  };
  const siteToken = {};
  const site = async (n) => {
    siteToken[n] = crypto.randomBytes(16).toString("hex");
    return Number((await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`${n}_${t}`, siteToken[n]])).insertId);
  };
  const project = async (n) => Number((await q(`INSERT INTO projects (name, start_date) VALUES (?, '2026-01-01')`, [`${n} ${t}`])).insertId);

  const S1 = await site("S1"), S2 = await site("S2"), S3 = await site("S3");
  const P1 = await project("P1"), P2 = await project("P2");
  for (const [s, p] of [[S1, P1], [S2, P1], [S3, P2]]) await q(`INSERT INTO site_projects (site_id, project_id) VALUES (?, ?)`, [s, p]);

  const master = await user("master", "master");
  const clin = await user("clin", "admin", { technical: 1 });   // clinician: S1
  const res = await user("res", "admin");                        // researcher: S1 + S2
  const edP2 = await user("edP2", "admin");                      // edits P2 (at S3), clinic S1
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?), (?, ?), (?, ?), (?, ?)`, [clin, S1, res, S1, res, S2, edP2, S1]);
  await q(`INSERT INTO project_editors (user_id, project_id) VALUES (?, ?)`, [edP2, P2]);

  const device = Number((await q(`INSERT INTO devices (installation_id, label, site_id) VALUES (?, 'Lab PC', ?)`, [`dev-${t}`, S1])).insertId);
  const S = SENTINELS;
  const exam = {
    tasks: [{ taskIndex: 0, type: "reading", subtype: null, repetition: 1, result: "done", takes: 2,
      clipFile: S.clip, videoFile: S.video, videoComplete: true, videoDurationMs: 1000, audioDurationMs: 1000,
      questionnaireAnswers: { q1: S.answer } }],
    hardware: { serial: S.hardware }, videoTakes: [{ file: S.take }], interruptions: [{ note: S.interruption }],
    timeline: [{ file: S.clip }], captureFormat: { sampleRate: 48000 }, sampleRate: 48000, timelineUsed: "original",
  };
  const sessions = {};
  const sess = async (key, siteId, projectId, extra = {}) => {
    const sid = crypto.randomBytes(16).toString("hex");
    const pk = Number((await q(
      `INSERT INTO upload_sessions (session_id, device_id, site_id, project_id, protocol_name, app_version, config_version,
         received_at, bytes, zip_sha256, storage_path, status, checks, patient_code, visit_number, participant_fields,
         participant_edited_at, exam_summary, tasks_total, tasks_done)
       VALUES (?, ?, ?, ?, 'Reading', '1.4.0', 'cv1', UTC_TIMESTAMP(3), 10, REPEAT('0', 64), 'x', 'valid', ?, ?, '1', ?, UTC_TIMESTAMP(), ?, 1, 1)`,
      [sid, device, siteId, projectId,
        JSON.stringify([{ key: "files", result: "fail", detail: S.check }]),
        extra.patient ?? `PC-${key}`,
        JSON.stringify({ patient_code: `PC-${key}`, surname: S.surname, birth: S.birth }),
        JSON.stringify(exam)]
    )).insertId);
    sessions[key] = { sid, pk };
  };
  await sess("a", S1, P1);
  await sess("b", S2, P1);
  await sess("c", S3, P2);
  const a = sessions.a.pk;
  await q(`INSERT INTO session_comments (upload_session_id, user_id, text, is_system) VALUES (?, ?, ?, 1), (?, ?, 'set review to OK', 1), (?, ?, 'Audio is clean', 0)`,
    [a, clin, `edited participant fields: ${S.edited}`, a, clin, a, clin]);
  await q(`INSERT INTO audit_log (user_id, action, upload_session_id, details) VALUES (?, 'participant_edit', ?, ?)`,
    [clin, a, JSON.stringify({ changes: [{ field: S.edited, from: S.surname, to: "x" }] })]);

  return { tokens, S1, S2, S3, P1, P2, sessions, siteToken };
}

const ids = (rows) => rows.map((r) => r.id).sort();

describe.skipIf(!dbUp)("MCP endpoint", () => {
  it("speaks MCP: initialize and tools/list with all v1 read tools", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const init = await rpc(w.tokens.clin, "initialize", {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" },
      });
      expect(init.status).toBe(200);
      expect(init.body.result.serverInfo.name).toBe("task-protocoller");
      expect(init.headers["mcp-session-id"]).toBeUndefined();

      const list = await rpc(w.tokens.clin, "tools/list");
      const names = list.body.result.tools.map((x) => x.name).sort();
      const WRITES = ["add_recording_comment", "copy_library_protocol", "save_protocol", "set_recording_qc"];
      expect(names).toEqual([
        "add_recording_comment", "copy_library_protocol",
        "get_clinic", "get_library_entry", "get_protocol", "get_recording", "get_recording_summary", "get_study",
        "list_clinics", "list_computers", "list_library", "list_protocols", "list_recording_comments", "list_recordings",
        "list_studies", "list_task_catalog", "save_protocol", "set_recording_qc", "whoami",
      ]);
      for (const x of list.body.result.tools) {
        expect(x.annotations?.readOnlyHint, x.name).toBe(!WRITES.includes(x.name));
      }
      const destructive = list.body.result.tools.filter((x) => x.annotations?.destructiveHint).map((x) => x.name).sort();
      expect(destructive).toEqual(["copy_library_protocol", "save_protocol"]);
    }));

  it("refuses GET and DELETE, and calls without a token", async () => {
    expect((await request(app).get("/mcp")).status).toBe(405);
    expect((await request(app).delete("/mcp")).headers.allow).toBe("POST");
    expect((await request(app).post("/mcp").send({})).status).toBe(401);
  });

  it("validates arguments before any controller runs", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const seen = [];
      const real = hold.q;
      hold.q = (sql, p) => { seen.push(sql); return real(sql, p); };
      const r = await tool(w.tokens.clin, "get_recording", { session_id: "../../etc/passwd" });
      expect(r.isError).toBe(true);
      expect(r.body).toMatch(/Input validation error/);
      // only the token lookup ran, no controller query
      expect(seen.some((sql) => /upload_sessions/.test(sql))).toBe(false);
      const big = await tool(w.tokens.clin, "add_nothing", {});
      expect(big.isError).toBe(true);
    }));
});

describe.skipIf(!dbUp)("MCP rights parity (strict clinic visibility)", () => {
  it("clinician, researcher and a foreign-study editor see what the web shows them", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const recs = async (who) => (await tool(w.tokens[who], "list_recordings", { page_size: 100 })).body.rows
        .map((r) => r.id).filter((id) => Object.values(w.sessions).some((s) => s.sid === id)).sort();
      const sid = (k) => w.sessions[k].sid;

      expect(await recs("clin")).toEqual([sid("a")]);
      expect(await recs("res")).toEqual([sid("a"), sid("b")].sort());
      // edits P2, but P2's recordings are at S3, which is not their clinic
      expect(await recs("edP2")).toEqual([sid("a")]);
      expect((await recs("master")).length).toBe(3);

      const me = (await tool(w.tokens.res, "whoami")).body;
      expect(me.clinics.map((c) => c.id).sort()).toEqual([w.S1, w.S2].sort());
      expect(me.role).toBe("admin");

      const clinics = (await tool(w.tokens.clin, "list_clinics")).body;
      expect(ids(clinics)).toEqual([w.S1]);

      // studies: received through the clinic vs owned
      const studies = (await tool(w.tokens.edP2, "list_studies")).body.filter((s) => [w.P1, w.P2].includes(s.id));
      expect(Object.fromEntries(studies.map((s) => [s.id, s.access]))).toEqual({ [w.P1]: "received", [w.P2]: "owned" });
    }));

  it("out of scope looks exactly like missing", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const missing = "f".repeat(32);
      const out = await tool(w.tokens.clin, "get_recording", { session_id: w.sessions.b.sid });
      const none = await tool(w.tokens.clin, "get_recording", { session_id: missing });
      expect(out).toMatchObject({ isError: true, body: { error: "not_found", status: 404 } });
      expect(none.body).toEqual(out.body);

      const s3 = await tool(w.tokens.clin, "get_clinic", { clinic_id: w.S3 });
      const sx = await tool(w.tokens.clin, "get_clinic", { clinic_id: 2000000000 });
      expect(s3.body).toEqual(sx.body);
      expect(s3.isError).toBe(true);

      const p2 = await tool(w.tokens.clin, "get_study", { study_id: w.P2 });
      const px = await tool(w.tokens.clin, "get_study", { study_id: 2000000000 });
      expect(p2.body).toEqual(px.body);
      expect((await tool(w.tokens.clin, "list_recording_comments", { session_id: w.sessions.c.sid })).body.status).toBe(404);
      expect((await tool(w.tokens.clin, "get_recording_summary", { clinic_id: w.S3 })).body.status).toBe(404);
    }));
});

describe.skipIf(!dbUp)("MCP never returns participant data", () => {
  it("no sentinel in any read tool's result, for any user", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const a = w.sessions.a.sid;
      const calls = [
        ["whoami"], ["list_studies", { include_archived: true }], ["get_study", { study_id: w.P1 }],
        ["list_clinics"], ["get_clinic", { clinic_id: w.S1 }], ["list_protocols", { study_id: w.P1 }],
        ["list_library"], ["list_task_catalog"], ["list_recordings", { page_size: 100 }],
        ["list_recordings", { q: "PC-a" }], ["get_recording", { session_id: a }],
        ["get_recording_summary"], ["list_recording_comments", { session_id: a }], ["list_computers"],
      ];
      const secrets = [...Object.values(SENTINELS), ...Object.values(w.siteToken)];
      for (const who of ["master", "clin", "res"]) {
        for (const [name, args] of calls) {
          const r = await tool(w.tokens[who], name, args ?? {});
          for (const s of secrets) {
            expect(r.raw.includes(s), `${who} ${name} leaked ${s}`).toBe(false);
          }
        }
      }

      // control: the raw controller result does carry them, so the scan can see a leak
      const { callHandler } = await import("../../src/mcp/callHandler.js");
      const { getUpload } = await import("../../src/controllers/uploadController.js");
      const [m] = await q(`SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email LIKE 'clin-%@mcpread.test' ORDER BY u.id DESC LIMIT 1`);
      const raw = JSON.stringify((await callHandler(getUpload, { admin: { id: m.id, role: m.role }, params: { sessionId: a } })).body);
      for (const s of [SENTINELS.clip, SENTINELS.video, SENTINELS.answer, SENTINELS.check, SENTINELS.take, SENTINELS.hardware, SENTINELS.edited]) {
        expect(raw, `control ${s}`).toContain(s);
      }

      // what is shown instead
      const rec = (await tool(w.tokens.clin, "get_recording", { session_id: a })).body;
      expect(rec.participant).toEqual({ patient_code: "PC-a", visit_number: "1" });
      expect(rec.tasks[0]).toMatchObject({ hasClip: true, hasVideo: true, hasAnswers: true, takes: 2 });
      expect(rec.checks).toEqual([{ key: "files", result: "fail" }]);
      expect(rec.comments.map((c) => [c.kind, c.text])).toEqual([["qc", "set review to OK"], ["comment", "Audio is clean"]]);
      expect(rec.appVersion).toBe("1.4.0");
      // no technical details for a user the master did not pick
      const plain = (await tool(w.tokens.res, "get_recording", { session_id: a })).body;
      expect(plain.checks).toBeUndefined();
      expect(plain.appVersion).toBeUndefined();
    }));

  it("logs the tool, user and status only", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      logToFile.mockClear();
      await tool(w.tokens.clin, "list_recordings", { q: "SENT_ARG_SEARCH" });
      await tool(w.tokens.clin, "get_recording", { session_id: w.sessions.b.sid });
      const logged = JSON.stringify(logToFile.mock.calls);
      expect(logged).not.toContain("SENT_ARG_SEARCH");
      expect(logged).not.toContain(w.sessions.b.sid);
      expect(logged).not.toContain(w.tokens.clin);
      const lines = logToFile.mock.calls.filter((c) => c[1] === "mcp_call").map((c) => c[2]);
      expect(lines.map((l) => [l.tool, l.status])).toEqual([["list_recordings", 200], ["get_recording", 404]]);
      expect(lines[1].code).toBe("not_found");
    }));
});
