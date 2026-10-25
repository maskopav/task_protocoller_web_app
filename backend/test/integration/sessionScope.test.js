// Session visibility/edit rule (accessScope.scopeWhereClause) against a real
// MariaDB. The rule is strict: a recording is visible through its clinic and
// nothing else, so editing a study never widens it (spec criterion 8).
// Mocked-SQL tests can only check the predicate's shape; this checks what it
// actually selects.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";
import { scopeWhereClause } from "../../src/utils/accessScope.js";

const dbUp = await testDbAvailable();
afterAll(closeTestDb);

const tag = () => crypto.randomBytes(4).toString("hex");

async function buildWorld(q) {
  const t = tag();
  const [{ id: adminRole }] = await q(`SELECT id FROM roles WHERE name = 'admin'`);
  const [{ id: masterRole }] = await q(`SELECT id FROM roles WHERE name = 'master'`);
  const user = async (name, role = adminRole) =>
    (await q(`INSERT INTO users (email, password_hash, role_id) VALUES (?, 'x', ?)`, [`${name}-${t}@scope.test`, role])).insertId;
  const site = async (name) =>
    (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`${name}_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const project = async (name) =>
    (await q(`INSERT INTO projects (name, start_date) VALUES (?, '2026-01-01')`, [`${name} ${t}`])).insertId;

  const S1 = await site("S1"), S2 = await site("S2"), S3 = await site("S3");
  const P1 = await project("P1"), P2 = await project("P2");
  for (const [s, p] of [[S1, P1], [S2, P1], [S3, P2], [S1, P2]]) {
    await q(`INSERT INTO site_projects (site_id, project_id) VALUES (?, ?)`, [s, p]);
  }

  const users = {
    master: await user("master", masterRole),
    editorNoClinic: await user("en"),
    editorOneClinic: await user("e1"),
    clinicAdmin: await user("ca"),
    stranger: await user("xx"),
  };
  // Edits study P1 but is assigned to no clinic at all: sees no recordings.
  await q(`INSERT INTO project_editors (user_id, project_id) VALUES (?, ?)`, [users.editorNoClinic, P1]);
  // Edits P1 and has clinic S2 only: sees S2's recordings, not S1's of the same study.
  await q(`INSERT INTO project_editors (user_id, project_id) VALUES (?, ?)`, [users.editorOneClinic, P1]);
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`, [users.editorOneClinic, S2]);
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`, [users.clinicAdmin, S1]);

  const device = (await q(`INSERT INTO devices (installation_id) VALUES (?)`, [`dev-${t}`])).insertId;
  const sessions = {};
  const sess = async (key, siteId, projectId) => {
    sessions[key] = (await q(
      `INSERT INTO upload_sessions (session_id, device_id, site_id, project_id, received_at, bytes, zip_sha256, storage_path)
       VALUES (?, ?, ?, ?, NOW(3), 1, REPEAT('0', 64), 'x')`,
      [crypto.randomBytes(16).toString("hex"), device, siteId, projectId]
    )).insertId;
  };
  await sess("a", S1, P1);
  await sess("b", S2, P1);
  await sess("c", S3, P2);
  await sess("d", S1, P2);
  await sess("q", null, null);   // quarantine
  await sess("e", S1, null);     // project could not be matched
  return { users, sessions };
}

async function selected(q, world, who, opts) {
  const admin = { id: world.users[who], role: who === "master" ? "master" : "admin" };
  const scope = scopeWhereClause(admin, "us", opts);
  const ids = Object.values(world.sessions);
  const rows = await q(
    `SELECT us.id FROM upload_sessions us WHERE us.id IN (?) AND ${scope.sql}`,
    [ids, ...scope.params]
  );
  const byId = Object.fromEntries(Object.entries(world.sessions).map(([k, v]) => [v, k]));
  return rows.map((r) => byId[r.id]).sort().join("");
}

const EXPECTED = {
  //             see       edit
  master:       ["abcdeq", "abcdeq"],
  editorNoClinic:  ["",    ""],
  editorOneClinic: ["b",   "b"],
  clinicAdmin:     ["ade", "ade"],
  stranger:        ["",    ""],
};

describe.skipIf(!dbUp)("scopeWhereClause against MariaDB", () => {
  for (const [who, [see, edit]] of Object.entries(EXPECTED)) {
    it(`${who} sees "${see}" and may edit "${edit}"`, async () => {
      await withRollback(async (q) => {
        const world = await buildWorld(q);
        expect(await selected(q, world, who)).toBe(see);
        expect(await selected(q, world, who, { editable: true })).toBe(edit);
      });
    });
  }
});
