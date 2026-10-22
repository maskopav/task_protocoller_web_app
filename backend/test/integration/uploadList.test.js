// The list, detail, summary and review SQL of uploadController against a real
// MariaDB. Mocked-SQL unit tests cannot catch a syntax error or a wrong column,
// so this runs the controller's own queries inside a rolled-back transaction:
// queryHelper is replaced by a shim that forwards to the test connection.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";

const hold = { q: null };
vi.mock("../../src/db/queryHelper.js", () => ({
  executeQuery: (sql, params = []) => hold.q(sql, params),
  executeTransaction: async (cb) => cb({ query: async (sql, params = []) => [await hold.q(sql, params)] }),
}));

const dbUp = await testDbAvailable();
afterAll(closeTestDb);
const C = await import("../../src/controllers/uploadController.js");

const tag = () => crypto.randomBytes(4).toString("hex");

const makeRes = () => {
  const res = { code: 200, body: undefined, headers: {} };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.set = (h) => { Object.assign(res.headers, h); return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
};
const call = async (fn, admin, { query = {}, params = {}, body = {} } = {}) => {
  const res = makeRes();
  await fn({ admin, query, params, body }, res);
  return res;
};

async function world(q) {
  const t = tag();
  const [{ id: adminRole }] = await q(`SELECT id FROM roles WHERE name = 'admin'`);
  const user = async (n, full) =>
    (await q(`INSERT INTO users (email, password_hash, role_id, full_name) VALUES (?, 'x', ?, ?)`, [`${n}-${t}@list.test`, adminRole, full])).insertId;
  const S1 = (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`S1_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const S2 = (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`S2_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const P1 = (await q(`INSERT INTO projects (name, start_date) VALUES (?, '2026-01-01')`, [`P1 ${t}`])).insertId;
  await q(`INSERT INTO site_projects (site_id, project_id) VALUES (?, ?)`, [S1, P1]);
  const editor = await user("ed", "Eva Editor");
  const reader = await user("rd", null);
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`, [editor, S1]);
  await q(`INSERT INTO user_projects (user_id, project_id, can_edit) VALUES (?, ?, 0)`, [reader, P1]);
  const dev = (await q(`INSERT INTO devices (installation_id, label) VALUES (?, ?)`, [`dev-${t}`, `Lab PC ${t}`])).insertId;

  const ids = {};
  const sess = async (key, o) => {
    const sid = crypto.randomBytes(16).toString("hex");
    const pf = JSON.stringify({ patient_code: o.code, visit_number: "V1", surname: "Secret" });
    await q(
      `INSERT INTO upload_sessions (session_id, device_id, site_id, project_id, protocol_name, received_at, ended_at, bytes,
         zip_sha256, storage_path, status, qc, flags, video_clips, patient_code, visit_number, participant_fields, exam_summary)
       VALUES (?, ?, ?, ?, 'PD-battery', ?, ?, 10, REPEAT('0', 64), 'x', ?, ?, ?, ?, ?, 'V1', ?, '{"tasks":[]}')`,
      [sid, dev, S1, P1, o.received, o.received, o.status ?? "valid", o.qc ?? "unreviewed",
        JSON.stringify(o.flags ?? []), o.video ?? 0, o.code, pf]
    );
    ids[key] = sid;
  };
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 19).replace("T", " ");
  await sess("a", { code: `PD${t}1`, received: day(1), flags: ["recovered", "retakes"], video: 2 });
  await sess("b", { code: `PD${t}2`, received: day(2), status: "invalid", qc: "review" });
  await sess("c", { code: `HC${t}3`, received: day(40), qc: "ok", flags: ["late"] });
  return { t, S1, S2, P1, editor, reader, ids, dev };
}

const master = { id: 0, role: "master" };
const sessionIds = (res) => res.body.rows.map((r) => r.id);

describe.skipIf(!dbUp)("uploadController SQL against MariaDB", () => {
  it("list: filters, sort, pagination, kpis, facets", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const ed = { id: w.editor, role: "admin" };
      const mine = { site: String(w.S1), pageSize: "100" };

      let r = await call(C.listUploads, ed, { query: mine });
      expect(r.code).toBe(200);
      expect(r.body.total).toBe(3);
      expect(r.body.rows.every((x) => x.canEdit)).toBe(true);
      expect(r.body.kpis).toMatchObject({ received7d: 2, valid: 2, invalid: 1, unreviewed: 1 });
      expect(r.body.kpis.attention).toBe(2);
      expect(r.body.facets.sites.find((s) => s.id === w.S1).count).toBe(3);
      expect(r.body.facets.flags.find((f) => f.key === "recovered").count).toBe(1);
      expect(JSON.stringify(r.body)).not.toContain("Secret");

      const check = async (query, expected) => {
        const res = await call(C.listUploads, ed, { query: { ...mine, ...query } });
        expect(res.code, JSON.stringify(query)).toBe(200);
        expect(sessionIds(res).sort(), JSON.stringify(query)).toEqual(expected.map((k) => w.ids[k]).sort());
      };
      await check({ q: "HC" }, ["c"]);
      await check({ q: w.ids.a.slice(0, 6) }, ["a"]);
      await check({ q: "Lab PC" }, ["a", "b", "c"]);
      await check({ status: "invalid" }, ["b"]);
      await check({ qc: "ok" }, ["c"]);
      await check({ flag: ["recovered", "retakes"] }, ["a"]);
      await check({ flag: "recovered,late" }, []);
      await check({ hasVideo: "1" }, ["a"]);
      await check({ attention: "1" }, ["a", "b"]);
      await check({ protocol: "PD-battery" }, ["a", "b", "c"]);
      await check({ project: String(w.P1) }, ["a", "b", "c"]);
      await check({ project: `P1 ${w.t}` }, ["a", "b", "c"]);
      await check({ dateField: "recorded", from: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10) }, ["a", "b"]);

      for (const sort of ["receivedAt", "site", "patient", "protocol", "endedAt", "durationS", "bytes", "status", "qc"]) {
        for (const dir of ["asc", "desc"]) {
          const res = await call(C.listUploads, ed, { query: { ...mine, sort, dir } });
          expect(res.code, sort).toBe(200);
        }
      }
      r = await call(C.listUploads, ed, { query: { ...mine, sort: "status", dir: "asc" } });
      expect(r.body.rows[0].status).toBe("invalid");
      r = await call(C.listUploads, ed, { query: { ...mine, pageSize: "10", page: "2" } });
      expect(r.body.rows).toHaveLength(0);
      expect(r.body.total).toBe(3);

      const csv = await call(C.exportCsv, ed, { query: mine });
      expect(csv.headers["Content-Type"]).toMatch(/text\/csv/);
      expect(csv.body.split("\r\n").length).toBe(5);
    });
  });

  it("scope: a read-only project reader sees the rows but cannot edit", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const rd = { id: w.reader, role: "admin" };
      const r = await call(C.listUploads, rd, { query: {} });
      expect(r.body.total).toBe(3);
      expect(r.body.rows.every((x) => x.canEdit === false)).toBe(true);
      const stranger = { id: w.reader + 100000, role: "admin" };
      expect((await call(C.listUploads, stranger)).body.total).toBe(0);
      expect((await call(C.getUpload, stranger, { params: { sessionId: w.ids.a } })).code).toBe(404);
      expect((await call(C.putQc, rd, { params: { sessionId: w.ids.a }, body: { qc: "ok" } })).code).toBe(403);
    });
  });

  it("detail: masked participant, prev/next, comments, review and participant edit", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const ed = { id: w.editor, role: "admin" };
      const p = (k) => ({ sessionId: w.ids[k] });
      // default order: received desc, so a, b, c
      let r = await call(C.getUpload, ed, { params: p("b"), query: { site: String(w.S1) } });
      expect(r.code).toBe(200);
      expect(r.body.prevId).toBe(w.ids.a);
      expect(r.body.nextId).toBe(w.ids.c);
      expect(r.body.participant.fields).toMatchObject({ surname: null });
      expect(r.body.participant.maskedKeys).toEqual(["surname"]);
      expect(r.body.canEdit).toBe(true);

      r = await call(C.revealParticipant, ed, { params: p("b") });
      expect(r.body.fields.surname).toBe("Secret");

      r = await call(C.patchParticipant, ed, { params: p("b"), body: { fields: { surname: "Fixed", patient_code: "NEW1" } } });
      expect(r.code).toBe(200);
      expect(r.body.changed).toEqual(["surname", "patient_code"]);
      const [row] = await q(`SELECT patient_code, participant_edited_at FROM upload_sessions WHERE session_id = ?`, [w.ids.b]);
      expect(row.patient_code).toBe("NEW1");
      expect(row.participant_edited_at).not.toBeNull();
      const audit = await q(`SELECT a.action FROM audit_log a JOIN upload_sessions us ON us.id = a.upload_session_id WHERE us.session_id = ? ORDER BY a.id`, [w.ids.b]);
      expect(audit.map((a) => a.action)).toEqual(["reveal", "participant_edit"]);

      r = await call(C.putQc, ed, { params: p("b"), body: { qc: "ok" } });
      expect(r.code).toBe(200);
      r = await call(C.addComment, ed, { params: p("b"), body: { text: "  hello  " } });
      expect(r.code).toBe(201);
      expect(r.body).toMatchObject({ who: "EE", name: "Eva Editor", text: "hello", system: false });
      r = await call(C.getComments, ed, { params: p("b") });
      expect(r.body.map((c) => c.text)).toEqual([
        "edited participant fields: surname, patient_code", "set review to OK", "hello"]);
      r = await call(C.listUploads, ed, { query: { site: String(w.S1) } });
      expect(r.body.rows.find((x) => x.id === w.ids.b).commentCount).toBe(1);

      r = await call(C.getAttempts, ed, { params: p("b") });
      expect(r.body).toEqual([]);
    });
  });

  it("summary: scoped counts, day series, by protocol and site", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const ed = { id: w.editor, role: "admin" };
      let r = await call(C.getSummary, ed, { query: { siteId: String(w.S1), days: "7" } });
      expect(r.code).toBe(200);
      expect(r.body).toMatchObject({ week: 2, last30: 2, total: 3, invalid: 1, needsReview: 1, days: 7 });
      expect(r.body.perDay).toHaveLength(7);
      expect(r.body.perDay.reduce((a, d) => a + d.count, 0)).toBe(2);
      expect(r.body.byProtocol).toEqual([{ protocol: "PD-battery", count: 2 }]);
      expect(r.body.bySite).toEqual([{ id: w.S1, name: `S1_${w.t}`, count: 2 }]);
      expect(r.body.lastUpload).toMatch(/Z$/);

      r = await call(C.getSummary, ed, { query: { siteId: String(w.S2) } });
      expect(r.code).toBe(404);
      r = await call(C.getSummary, ed, { query: { projectId: String(w.P1) } });
      expect(r.code).toBe(200);
      r = await call(C.getSummary, master, { query: {} });
      expect(r.code).toBe(200);
    });
  });
});
