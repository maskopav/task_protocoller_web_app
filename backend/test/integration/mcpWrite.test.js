// MCP write tools against a real MariaDB (docs/mcp/01_spec.md section 8,
// test 6): comments and QC like the UI, protocol preview writes nothing,
// confirm saves, stale versions and missing rights are refused.
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

let rpcId = 0;
async function tool(token, name, args = {}) {
  const res = await request(app).post("/mcp")
    .set({ Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" })
    .send({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } });
  expect(res.status).toBe(200);
  const text = res.body.result.content[0].text;
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { isError: !!res.body.result.isError, body };
}

async function world(q) {
  const t = crypto.randomBytes(4).toString("hex");
  const roleId = async (n) => (await q(`SELECT id FROM roles WHERE name = ?`, [n]))[0].id;
  const tokens = {};
  const user = async (key, roleName) => {
    const id = Number((await q(
      `INSERT INTO users (email, password_hash, role_id, can_use_mcp, full_name) VALUES (?, 'x', ?, 1, ?)`,
      [`${key}-${t}@mcpwrite.test`, await roleId(roleName), `User ${key}`]
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
  const site = async (n) => Number((await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`${n}_${t}`, crypto.randomBytes(16).toString("hex")])).insertId);
  const project = async (n) => Number((await q(`INSERT INTO projects (name, start_date) VALUES (?, '2026-01-01')`, [`${n} ${t}`])).insertId);

  const S1 = await site("S1"), S2 = await site("S2"), S3 = await site("S3");
  const P1 = await project("P1"), P2 = await project("P2");
  for (const [s, p] of [[S1, P1], [S2, P1], [S3, P2]]) await q(`INSERT INTO site_projects (site_id, project_id) VALUES (?, ?)`, [s, p]);

  const master = await user("master", "master");
  const ed = await user("ed", "admin");      // edits P1, clinic S1 only
  const recv = await user("recv", "admin");  // clinic S1: receives P1, edits nothing
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?), (?, ?)`, [ed, S1, recv, S1]);
  await q(`INSERT INTO project_editors (user_id, project_id) VALUES (?, ?)`, [ed, P1]);

  const [task] = await q(`SELECT id FROM tasks ORDER BY id LIMIT 1`);
  const [lang] = await q(`SELECT id FROM languages WHERE code = 'en'`);

  // a library entry (project_id NULL) with one task
  const [g] = await q(`SELECT COALESCE(MAX(protocol_group_id), 0) + 1 AS g FROM protocols`);
  const libId = Number((await q(
    `INSERT INTO protocols (protocol_group_id, project_id, name, language_id, version, created_by, randomization, required_identifiers)
     VALUES (?, NULL, ?, ?, 1, ?, '{}', '[]')`,
    [g.g, `Lib ${t}`, lang.id, master]
  )).insertId);
  await q(`INSERT INTO protocol_tasks (protocol_id, task_id, task_order, params) VALUES (?, ?, 1, '{}')`, [libId, task.id]);

  const device = Number((await q(`INSERT INTO devices (installation_id, site_id) VALUES (?, ?)`, [`dev-${t}`, S1])).insertId);
  const rec = async (siteId, projectId) => {
    const sid = crypto.randomBytes(16).toString("hex");
    const pk = Number((await q(
      `INSERT INTO upload_sessions (session_id, device_id, site_id, project_id, received_at, bytes, zip_sha256, storage_path, status)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3), 1, REPEAT('0', 64), 'x', 'valid')`,
      [sid, device, siteId, projectId]
    )).insertId);
    return { sid, pk };
  };
  return { t, tokens, ids: { master, ed, recv }, S1, S2, S3, P1, P2, taskId: Number(task.id), langId: Number(lang.id), libId,
    recS1: await rec(S1, P1), recS2: await rec(S2, P1) };
}

const counts = async (q) => {
  const [r] = await q(`SELECT (SELECT COUNT(*) FROM protocols) AS p, (SELECT COUNT(*) FROM protocol_tasks) AS pt,
                              (SELECT COUNT(*) FROM protocol_contents) AS pc, (SELECT COUNT(*) FROM audit_log) AS a`);
  return r;
};

const newProtocol = (w, extra = {}) => ({
  study_id: w.P1,
  name: `Reading ${w.t}`,
  language_ids: [w.langId],
  tasks: [{ task_id: w.taskId, params: { duration: 30 }, contents: [{ type: "instructions", html: "<p>Read aloud</p>" }] }],
  info_text: "<p>Welcome</p>",
  ...extra,
});

describe.skipIf(!dbUp)("save_protocol: preview, then confirm", () => {
  it("previews without writing, then creates, then versions with base_version", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const before = await counts(q);

      const pv = await tool(w.tokens.ed, "save_protocol", newProtocol(w));
      expect(pv.isError).toBe(false);
      expect(pv.body).toMatchObject({ preview: true, valid: true, mode: "create", newVersion: 1, diff: null });
      // P1 runs at S1 and S2; ed sees only S1 by name
      expect(pv.body.affectedClinics).toEqual({ total: 2, visible: [{ id: w.S1, name: `S1_${w.t}` }] });
      expect(await counts(q)).toEqual(before);

      const saved = await tool(w.tokens.ed, "save_protocol", { ...newProtocol(w), confirm: true });
      expect(saved.body).toMatchObject({ saved: true });
      const [row] = await q(`SELECT protocol_group_id, version, is_current, created_by FROM protocols WHERE id = ?`, [saved.body.protocolId]);
      expect(row).toMatchObject({ version: 1, is_current: 1, created_by: w.ids.ed });
      const group = row.protocol_group_id;

      // edit: preview shows the diff and the base version
      const edit = newProtocol(w, {
        protocol_group_id: group, name: `Reading v2 ${w.t}`,
        tasks: [{ task_id: w.taskId, params: { duration: 45 } }, { task_id: w.taskId, params: {} }],
      });
      const before2 = await counts(q);
      const pv2 = await tool(w.tokens.ed, "save_protocol", edit);
      expect(pv2.body).toMatchObject({ mode: "new_version", baseVersion: 1, newVersion: 2, languagesUpdated: ["en"] });
      expect(pv2.body.diff.fields.name).toEqual({ from: `Reading ${w.t}`, to: `Reading v2 ${w.t}` });
      expect(pv2.body.diff.tasks).toMatchObject({ before: 1, after: 2, changedPositions: [1, 2] });
      expect(pv2.body.next).toMatch(/base_version: 1/);
      expect(await counts(q)).toEqual(before2);

      expect((await tool(w.tokens.ed, "save_protocol", { ...edit, confirm: true })).body).toMatchObject({ error: "base_version_required", status: 400 });
      const v2 = await tool(w.tokens.ed, "save_protocol", { ...edit, confirm: true, base_version: 1 });
      expect(v2.body.saved).toBe(true);
      const versions = await q(`SELECT version, is_current FROM protocols WHERE protocol_group_id = ? ORDER BY version`, [group]);
      expect(versions.map((v) => [v.version, v.is_current])).toEqual([[1, 0], [2, 1]]);

      // someone saved in between: the old base is refused, nothing written
      const before3 = await counts(q);
      const stale = await tool(w.tokens.ed, "save_protocol", { ...edit, confirm: true, base_version: 1 });
      expect(stale).toMatchObject({ isError: true, body: { error: "stale_version", status: 409, currentVersion: 2 } });
      expect(await counts(q)).toEqual(before3);
    }));

  it("refuses like the UI: received study 403, foreign study 404, in preview and confirm", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const before = await counts(q);
      for (const confirm of [false, true]) {
        const recv = await tool(w.tokens.recv, "save_protocol", { ...newProtocol(w), confirm });
        expect(recv).toMatchObject({ isError: true, body: { error: "not_editor", status: 403 } });
        const foreign = await tool(w.tokens.ed, "save_protocol", { ...newProtocol(w, { study_id: w.P2 }), confirm });
        expect(foreign).toMatchObject({ isError: true, body: { error: "project_not_found", status: 404 } });
      }
      expect(await counts(q)).toEqual(before);
    }));

  it("validates in the preview: unknown task, bad file-name template, question rules", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const unknown = await tool(w.tokens.ed, "save_protocol", newProtocol(w, {
        tasks: [{ task_id: w.taskId }, { task_id: 2000000000 }],
      }));
      expect(unknown.body).toMatchObject({ error: "task_invalid", status: 400, index: 1 });
      const tpl = await tool(w.tokens.ed, "save_protocol", newProtocol(w, { recordings_file_name: "${field.nope}" }));
      expect(tpl.body).toMatchObject({ error: "file_name_template_invalid", status: 400 });
      expect(tpl.body.detail).toBeTruthy();
      const rule = await tool(w.tokens.ed, "save_protocol", newProtocol(w, {
        tasks: [{ task_id: w.taskId, params: { questions: [{ id: "q1", type: "text", showIf: { question: "q9", equals: "x" } }] } }],
      }));
      expect(rule.body).toMatchObject({ error: "invalid_question_rule", status: 400, index: 0 });
      // a schema error never reaches a controller
      const bad = await tool(w.tokens.ed, "save_protocol", { ...newProtocol(w), tasks: [] });
      expect(bad.isError).toBe(true);
    }));
});

describe.skipIf(!dbUp)("copy_library_protocol", () => {
  it("previews, then copies into a study you edit", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const before = await counts(q);
      const pv = await tool(w.tokens.ed, "copy_library_protocol", { entry_id: w.libId, study_id: w.P1 });
      expect(pv.body).toMatchObject({ preview: true, valid: true, entry: { id: w.libId }, studyId: w.P1, languages: 1 });
      expect(pv.body.affectedClinics.total).toBe(2);
      expect(await counts(q)).toEqual(before);

      const done = await tool(w.tokens.ed, "copy_library_protocol", { entry_id: w.libId, study_id: w.P1, confirm: true });
      expect(done.body.copied).toBe(true);
      const [row] = await q(`SELECT project_id, copied_from_id FROM protocols WHERE id = ?`, [done.body.protocolId]);
      expect(row).toEqual({ project_id: w.P1, copied_from_id: w.libId });

      // received only: no library access at all
      expect((await tool(w.tokens.recv, "copy_library_protocol", { entry_id: w.libId, study_id: w.P1 })).body)
        .toMatchObject({ error: "forbidden", status: 403 });
    }));
});

describe.skipIf(!dbUp)("comments and QC", () => {
  it("behave like the UI, with audit and system note", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      logToFile.mockClear();
      const c = await tool(w.tokens.ed, "add_recording_comment", { session_id: w.recS1.sid, text: "SENT_COMMENT clean audio" });
      expect(c.body).toMatchObject({ kind: "comment", text: "SENT_COMMENT clean audio", author: "User ed" });
      const [stored] = await q(`SELECT user_id, is_system FROM session_comments WHERE upload_session_id = ?`, [w.recS1.pk]);
      expect(stored).toEqual({ user_id: w.ids.ed, is_system: 0 });

      const qc = await tool(w.tokens.ed, "set_recording_qc", { session_id: w.recS1.sid, qc: "ok" });
      expect(qc.body.qc).toBe("ok");
      expect(qc.body.comments.map((x) => x.kind)).toEqual(["comment", "qc"]);
      const [s] = await q(`SELECT qc FROM upload_sessions WHERE id = ?`, [w.recS1.pk]);
      expect(s.qc).toBe("ok");
      const audit = await q(`SELECT user_id, details FROM audit_log WHERE upload_session_id = ? AND action = 'qc_change'`, [w.recS1.pk]);
      expect(audit).toHaveLength(1);
      expect(Number(audit[0].user_id)).toBe(w.ids.ed);

      // the other clinic's recording does not exist for ed
      expect((await tool(w.tokens.ed, "add_recording_comment", { session_id: w.recS2.sid, text: "x" })).body).toMatchObject({ error: "not_found", status: 404 });
      expect((await tool(w.tokens.ed, "set_recording_qc", { session_id: w.recS2.sid, qc: "ok" })).body).toMatchObject({ error: "not_found", status: 404 });
      expect((await tool(w.tokens.ed, "add_recording_comment", { session_id: w.recS1.sid, text: "x".repeat(2001) })).isError).toBe(true);

      expect(JSON.stringify(logToFile.mock.calls)).not.toContain("SENT_COMMENT");
    }));
});
