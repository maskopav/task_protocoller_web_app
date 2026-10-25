// The study access model (spec sections 4, 8.1, 8.2) against a real MariaDB:
// project_editors, protocols.project_id, the rewritten views and the library
// rules. The controllers' own queries run inside a rolled-back transaction
// (queryHelper is replaced by a shim that forwards to the test connection).
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
const P = await import("../../src/controllers/projectController.js");
const PR = await import("../../src/controllers/protocolController.js");
const A = await import("../../src/utils/accessScope.js");

const tag = () => crypto.randomBytes(4).toString("hex");

const makeRes = () => {
  const res = { code: 200, body: undefined };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const call = async (fn, admin, { params = {}, query = {}, body = {} } = {}) => {
  const res = makeRes();
  await fn({ admin, params, query, body }, res);
  return res;
};

async function world(q) {
  const t = tag();
  const [{ id: adminRole }] = await q(`SELECT id FROM roles WHERE name = 'admin'`);
  const user = async (n, canCreate = 0) =>
    (await q(`INSERT INTO users (email, password_hash, role_id, can_create_projects) VALUES (?, 'x', ?, ?)`, [`${n}-${t}@acc.test`, adminRole, canCreate])).insertId;
  const site = async (n) =>
    (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`${n}_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;

  const S1 = await site("S1");
  const researcher = await user("res", 1);   // may create studies
  const editor = await user("ed");           // edits P1 later
  const clinician = await user("cl");        // only receives P1 through S1
  const stranger = await user("xx");
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`, [clinician, S1]);

  const R = { id: researcher, role: "admin" };
  const created = await call(P.createProject, R, { body: { name: `P1 ${t}`, description: "d" } });
  expect(created.code).toBe(201);
  const P1 = created.body.id;
  await q(`INSERT INTO site_projects (site_id, project_id) VALUES (?, ?)`, [S1, P1]);
  await q(`INSERT INTO project_editors (user_id, project_id) VALUES (?, ?)`, [editor, P1]);

  return { t, S1, P1, researcher, editor, clinician, stranger, R };
}

const as = (id) => ({ id, role: "admin" });
const task = { task_id: 1, params: {} };
const save = (admin, body) => call(PR.saveProtocol, admin, { body: { language_id: [1], tasks: [task], ...body } });

describe.skipIf(!dbUp)("study access model against MariaDB", () => {
  it("the creator becomes the first editor; received studies are visible but not editable", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);

      const [{ n }] = await q(`SELECT COUNT(*) AS n FROM project_editors WHERE project_id = ? AND user_id = ?`, [w.P1, w.researcher]);
      expect(Number(n)).toBe(1);

      const pick = async (id) => (await call(P.getProjectList, as(id))).body.find((x) => x.project_id === w.P1);
      expect(await pick(w.researcher)).toMatchObject({ can_edit: true, is_owner: true, site_count: 1, protocol_count: 0 });
      expect(await pick(w.editor)).toMatchObject({ can_edit: true, is_owner: false });
      expect(await pick(w.clinician)).toMatchObject({ can_edit: false, is_owner: false });
      expect(await pick(w.stranger)).toBeUndefined();

      expect((await call(P.getProject, as(w.clinician), { params: { id: w.P1 } })).code).toBe(200);
      expect((await call(P.getProject, as(w.stranger), { params: { id: w.P1 } })).code).toBe(404);
      expect((await call(P.updateProject, as(w.clinician), { params: { id: w.P1 }, body: { name: "x" } })).code).toBe(403);
      expect((await call(P.updateProject, as(w.stranger), { params: { id: w.P1 }, body: { name: "x" } })).code).toBe(404);
      expect((await call(P.updateProject, as(w.editor), { params: { id: w.P1 }, body: { description: "new" } })).code).toBe(200);
      // archiving is the creator's call, not any editor's
      expect((await call(P.archiveProject, as(w.editor), { params: { id: w.P1 }, body: { archived: true } })).code).toBe(403);
      expect((await call(P.archiveProject, w.R, { params: { id: w.P1 }, body: { archived: true } })).code).toBe(200);
    });
  });

  it("editing a study does not widen the clinics a user sees", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      expect(await A.getVisibleSiteIds(w.editor)).toEqual([]);
      expect(await A.getVisibleSiteIds(w.clinician)).toEqual([w.S1]);
      expect((await A.getVisibleProjectIds(w.editor)).includes(w.P1)).toBe(true);
      expect(await A.getEditableProjectIds(w.clinician)).toEqual([]);
    });
  });

  it("saving a protocol: editors yes, received 403, unseen 404; the config spine follows archiving", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);

      expect((await save(as(w.clinician), { name: "Nope", project_id: w.P1 })).code).toBe(403);
      expect((await save(as(w.stranger), { name: "Nope", project_id: w.P1 })).code).toBe(404);

      const ok = await save(as(w.editor), { name: "Speech", project_id: w.P1 });
      expect(ok.code).toBe(200);
      const [row] = await q(`SELECT project_id, copied_from_id FROM protocols WHERE id = ?`, [ok.body.protocol_id]);
      expect(Number(row.project_id)).toBe(w.P1);

      const spine = () => q(`SELECT protocol_id FROM v_site_protocols WHERE site_id = ?`, [w.S1]);
      expect((await spine()).map((r) => Number(r.protocol_id))).toEqual([ok.body.protocol_id]);

      // same name twice in one study is refused
      const dup = await save(as(w.editor), { name: "speech", project_id: w.P1 });
      expect([dup.code, dup.body]).toEqual([400, { error: "name_taken" }]);

      // grouped listing, one item with languages[]
      const list = await call(PR.getProtocolsByProjectId, as(w.clinician), { params: { id: w.P1 } });
      expect(list.body).toHaveLength(1);
      expect(list.body[0].languages).toEqual([{ language_id: 1, code: "en", protocol_id: ok.body.protocol_id }]);

      // received protocol: readable, not archivable
      const id = ok.body.protocol_id;
      expect((await call(PR.getProtocolById, as(w.clinician), { params: { id } })).body.can_edit).toBe(false);
      expect((await call(PR.archiveProtocol, as(w.clinician), { params: { id } })).code).toBe(403);
      expect((await call(PR.getProtocolById, as(w.stranger), { params: { id } })).code).toBe(404);

      expect((await call(PR.archiveProtocol, as(w.editor), { params: { id } })).code).toBe(200);
      expect(await spine()).toEqual([]);
      expect((await call(PR.getProtocolsByProjectId, as(w.editor), { params: { id: w.P1 } })).body).toEqual([]);
      const archived = await call(PR.getProtocolsByProjectId, as(w.editor), { params: { id: w.P1 }, query: { archived: "1" } });
      expect(archived.body).toHaveLength(1);
    });
  });

  it("a protocol name may repeat across studies, and a new version keeps its library link", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const P2 = (await call(P.createProject, w.R, { body: { name: `P2 ${w.t}` } })).body.id;

      const a = await save(w.R, { name: "Speech battery", project_id: w.P1 });
      const b = await save(w.R, { name: "Speech battery", project_id: P2 });
      expect([a.code, b.code]).toEqual([200, 200]);

      // simulate a copy from the library, then save a new version of it
      const [src] = await q(`SELECT protocol_group_id FROM protocols WHERE id = ?`, [a.body.protocol_id]);
      const lib = (await q(
        `INSERT INTO protocols (protocol_group_id, project_id, name, language_id, version, created_by)
         VALUES (9000, NULL, 'Lib', 1, 1, ?)`, [w.researcher]
      )).insertId;
      await q(`UPDATE protocols SET copied_from_id = ? WHERE id = ?`, [lib, a.body.protocol_id]);
      const v2 = await save(w.R, {
        name: "Speech battery", project_id: w.P1, protocol_group_id: src.protocol_group_id, editingMode: true,
      });
      expect(v2.code).toBe(200);
      const [row] = await q(`SELECT version, copied_from_id FROM protocols WHERE id = ?`, [v2.body.protocol_id]);
      expect([Number(row.version), Number(row.copied_from_id)]).toEqual([2, lib]);
    });
  });

  it("library entries never reach the config spine or a study list, and follow the library rule", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const lib = (await q(
        `INSERT INTO protocols (protocol_group_id, project_id, name, language_id, version, created_by)
         VALUES (9001, NULL, 'Shared', 1, 1, ?)`, [w.researcher]
      )).insertId;
      await q(`INSERT INTO protocol_tasks (protocol_id, task_id, task_order, params) VALUES (?, 1, 1, '{}')`, [lib]);

      expect(await q(`SELECT 1 FROM v_site_protocols WHERE protocol_id = ?`, [lib])).toEqual([]);
      expect(await q(`SELECT 1 FROM v_project_protocols WHERE id = ?`, [lib])).toEqual([]);
      expect((await call(PR.getProtocolsByProjectId, w.R, { params: { id: w.P1 } })).body).toEqual([]);

      expect(await A.canUseLibrary(w.researcher)).toBe(true);   // may create studies
      expect(await A.canUseLibrary(w.editor)).toBe(true);       // edits one
      expect(await A.canUseLibrary(w.clinician)).toBe(false);   // only receives
      expect(await A.canUseLibrary(w.stranger)).toBe(false);

      const get = (u) => call(PR.getProtocolById, as(u), { params: { id: lib } });
      expect((await get(w.editor)).body.can_edit).toBe(false);
      expect((await get(w.researcher)).body.can_edit).toBe(true);   // the author
      expect((await get(w.clinician)).code).toBe(404);

      // only the author (or master) saves a new library version
      const group = { project_id: null, protocol_group_id: 9001, editingMode: true, name: "Shared" };
      expect((await save(as(w.editor), group)).code).toBe(403);
      expect((await save(as(w.researcher), group)).code).toBe(200);
      expect((await save(as(w.clinician), group)).code).toBe(404);
    });
  });
});
