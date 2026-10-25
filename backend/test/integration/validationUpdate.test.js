// validateStoredSession's UPDATE against a real MariaDB in STRICT mode. Hostile
// archives used to make it throw (a string longer than its column, a null
// task), which left the row 'validating' and failed again on every restart.
// The real validator and extractor run on fixture ZIPs; queryHelper is shimmed
// onto a rolled-back test connection (as in uploadList.test.js).
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";
import { buildSessionZip, LONG } from "../fixtures/buildSessionZip.js";

const hold = { q: null };
vi.mock("../../src/db/queryHelper.js", () => ({
  executeQuery: (sql, params = []) => hold.q(sql, params),
  executeTransaction: async (cb) => cb({ query: async (sql, params = []) => [await hold.q(sql, params)] }),
}));
vi.mock("../../src/utils/logger.js", () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const dbUp = await testDbAvailable();
const dirs = [];
afterAll(async () => {
  dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  await closeTestDb();
});
const { validateStoredSession } = await import("../../src/upload/validationQueue.js");

// STRICT on the session, whatever the server default, so an over-long value
// is an error here and not a silent truncation by the server.
async function strict(q) {
  await q(`SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',STRICT_ALL_TABLES')`);
}

async function sessionRow(q, f, { participantEditedAt = null } = {}) {
  const t = crypto.randomBytes(4).toString("hex");
  const site = (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`V_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const dev = (await q(`INSERT INTO devices (installation_id, label, site_id) VALUES (?, ?, ?)`, [f.installationId, `PC ${t}`, site])).insertId;
  const id = (await q(
    `INSERT INTO upload_sessions (session_id, device_id, site_id, received_at, bytes, zip_sha256, storage_path, status,
       patient_code, visit_number, participant_fields, participant_edited_at)
     VALUES (?, ?, ?, '2026-10-13 08:20:00.000', ?, ?, 'x', 'validating', 'EDITED', 'V9', '{"patient_code":"EDITED"}', ?)`,
    [f.sessionId, dev, site, f.bytes, f.sha256, participantEditedAt]
  )).insertId;
  return id;
}

const build = (variant) => {
  // A fresh installationId: devices.installation_id is unique, and the test DB may hold the fixture's.
  const f = buildSessionZip({ variant, installationId: crypto.randomUUID() });
  dirs.push(path.dirname(f.path));
  return f;
};
const storeFor = (f) => ({ resolve: () => f.path });
// mysql2 >= 3.2x returns JSON-typed columns already parsed; older versions returned a string.
const asObj = (v) => (typeof v === "string" ? JSON.parse(v) : v);

const read = async (q, id) => (await q(
  `SELECT status, invalid_reason, protocol_name, protocol_project, config_version, patient_code, visit_number,
          participant_fields, tasks_total, tasks_done, checks FROM upload_sessions WHERE id = ?`, [id]))[0];

describe.skipIf(!dbUp)("validateStoredSession UPDATE against MariaDB (STRICT)", () => {
  it("the unmodified long values are really rejected by this database", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      await strict(q);
      const id = await sessionRow(q, build("valid"));
      await expect(q(`UPDATE upload_sessions SET protocol_name = ? WHERE id = ?`, [LONG.protocolName, id]))
        .rejects.toMatchObject({ code: "ER_DATA_TOO_LONG" });
    });
  });

  it("longStrings: the row is written with every string truncated to its column", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      await strict(q);
      const f = build("longStrings");
      const id = await sessionRow(q, f);
      await validateStoredSession(id, { store: storeFor(f) });
      const r = await read(q, id);
      expect(r).toMatchObject({
        status: "valid", invalid_reason: null,
        protocol_name: LONG.protocolName.slice(0, 100),
        protocol_project: LONG.protocolProject.slice(0, 255),
        config_version: LONG.configVersion.slice(0, 32),
        patient_code: LONG.patientCode.slice(0, 255),
        visit_number: LONG.visitNumber.slice(0, 64),
        tasks_total: 5,
      });
      expect(asObj(r.participant_fields).patient_code).toBe(LONG.patientCode);
    });
  });

  it("nullTask: the row is written, the null elements are skipped", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      await strict(q);
      const f = build("nullTask");
      const id = await sessionRow(q, f);
      await validateStoredSession(id, { store: storeFor(f) });
      expect(await read(q, id)).toMatchObject({ status: "valid", tasks_total: 5, tasks_done: 5, patient_code: "testx" });
    });
  });

  it("a master's participant edit survives re-validation", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      await strict(q);
      const f = build("valid");
      const id = await sessionRow(q, f, { participantEditedAt: "2026-10-14 09:00:00" });
      await validateStoredSession(id, { store: storeFor(f) });
      const r = await read(q, id);
      expect(r).toMatchObject({ status: "valid", patient_code: "EDITED", visit_number: "V9", tasks_total: 5 });
      expect(asObj(r.participant_fields)).toEqual({ patient_code: "EDITED" });
    });
  });
});
