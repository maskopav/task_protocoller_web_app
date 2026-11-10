// Admin device-log API (docs/device_logs/01_spec.md §5, §8) against a real MariaDB:
// master only (404 for anyone else), list scoped to a clinic, gunzipped view,
// the .gz as download, ?ticket= auth for view/download, audit rows.
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
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
const { createDeviceLogAdminRouter } = await import("../../src/routes/deviceLogsAdmin.js");
const { LocalFileStore } = await import("../../src/storage/fileStore.js");
const { signAdminToken, signDownloadTicket } = await import("../../src/utils/jwt.js");

const TEXT = "2026-11-09 10:00:00.123 INFO  app started\n2026-11-09 10:00:01.000 WARN  ünïcode line\n";
const GZ = zlib.gzipSync(Buffer.from(TEXT, "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

let dataPath, store, app;
beforeAll(() => {
  dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "device-logs-admin-"));
  store = new LocalFileStore(dataPath);
  app = express();
  app.use("/devices/logs", createDeviceLogAdminRouter({ store }));
});
afterAll(() => fs.rmSync(dataPath, { recursive: true, force: true }));

async function world(q) {
  const t = crypto.randomBytes(4).toString("hex");
  const role = async (name) => (await q(`SELECT id FROM roles WHERE name = ?`, [name]))[0].id;
  const user = async (n, roleName) => {
    const id = (await q(`INSERT INTO users (email, password_hash, role_id) VALUES (?, 'x', ?)`, [`${n}-${t}@logs.test`, await role(roleName)])).insertId;
    return { id, role: roleName, tv: 0, token_version: 0, email: `${n}-${t}@logs.test`, role_id: roleName === "master" ? 1 : 2 };
  };
  const master = await user("m", "master");
  const admin = await user("a", "admin");
  const site = async (n) => (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`${n}_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const S1 = await site("S1");
  const S2 = await site("S2");
  // the plain admin sees S1 as one of "their" clinics: still no access to logs
  await q(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`, [admin.id, S1]);
  const dev = async (name, label, siteId) =>
    (await q(`INSERT INTO devices (installation_id, label, site_id) VALUES (?, ?, ?)`, [`${name}-${t}`, label, siteId])).insertId;
  const d1 = await dev("d1", "Lab PC", S1);
  const d2 = await dev("d2", null, S1);
  const d3 = await dev("d3", "Other clinic PC", S2);

  const log = async (deviceId, siteId, fileName, received, { buf = GZ, write = true } = {}) => {
    const hash = sha(Buffer.concat([buf, Buffer.from(fileName + deviceId)]));
    const key = store.deviceLogKey(deviceId, hash);
    if (write) {
      fs.mkdirSync(path.dirname(store.resolve(key)), { recursive: true });
      fs.writeFileSync(store.resolve(key), buf);
    }
    return (await q(
      `INSERT INTO device_logs (device_id, site_id, file_name, sha256, bytes, utc_offset, app_version, received_at)
       VALUES (?, ?, ?, ?, ?, '+01:00', '1.4.0', ?)`,
      [deviceId, siteId, fileName, hash, buf.length, received]
    )).insertId;
  };
  const older = await log(d1, S1, "app.2026-11-08.0.log.gz", "2026-11-09 08:00:00");
  const newer = await log(d1, S1, "app.2026-11-09.0.log.gz", "2026-11-10 08:00:00");
  const other = await log(d2, S1, "app.2026-11-09.1.log.gz", "2026-11-09 12:00:00");
  const foreign = await log(d3, S2, "app.2026-11-09.0.log.gz", "2026-11-10 09:00:00");
  const missing = await log(d1, S1, "app.2026-11-07.0.log.gz", "2026-11-08 08:00:00", { buf: Buffer.from("gone"), write: false });
  return { t, master, admin, S1, S2, d1, d2, d3, older, newer, other, foreign, missing };
}

const bearer = (u) => ({ Authorization: `Bearer ${signAdminToken(u)}` });
const ticketOf = (u) => signDownloadTicket({ id: u.id, tv: 0 });
const binary = (res, cb) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
const audit = (q, action, logId) =>
  q(`SELECT user_id, details FROM audit_log WHERE action = ? AND JSON_EXTRACT(details, '$.logId') = ?`, [action, logId]);

describe.skipIf(!dbUp)("device log admin API", () => {
  describe("a non-master gets 404", () => {
    it("on all three routes, with a session token", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const h = bearer(w.admin);
        expect((await request(app).get(`/devices/logs?siteId=${w.S1}`).set(h)).status).toBe(404);
        expect((await request(app).get(`/devices/logs/${w.newer}/view`).set(h)).status).toBe(404);
        expect((await request(app).get(`/devices/logs/${w.newer}/download`).set(h)).status).toBe(404);
        expect(await audit(q, "device_log_view", w.newer)).toHaveLength(0);
        expect(await audit(q, "device_log_download", w.newer)).toHaveLength(0);
      });
    });

    it("on view and download with a ticket of a non-master", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const t = ticketOf(w.admin);
        expect((await request(app).get(`/devices/logs/${w.newer}/view?ticket=${t}`)).status).toBe(404);
        expect((await request(app).get(`/devices/logs/${w.newer}/download?ticket=${t}`)).status).toBe(404);
      });
    });

    it("an unauthenticated request is 401", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        expect((await request(app).get(`/devices/logs?siteId=${w.S1}`)).status).toBe(401);
        expect((await request(app).get(`/devices/logs/${w.newer}/view`)).status).toBe(401);
        expect((await request(app).get(`/devices/logs/${w.newer}/download?ticket=garbage`)).status).toBe(401);
      });
    });
  });

  describe("GET /devices/logs?siteId=", () => {
    it("lists the clinic's logs, newest first, with the §5 fields", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).get(`/devices/logs?siteId=${w.S1}`).set(bearer(w.master));
        expect(res.status).toBe(200);
        expect(res.body.logs.map((l) => l.id)).toEqual([w.newer, w.other, w.older, w.missing]);
        expect(res.body.logs[0]).toEqual({
          id: w.newer, deviceId: w.d1, deviceLabel: "Lab PC", installationId: expect.stringMatching(/^d1-/),
          fileName: "app.2026-11-09.0.log.gz", bytes: GZ.length, utcOffset: "+01:00", appVersion: "1.4.0",
          receivedAt: "2026-11-10T08:00:00.000Z",
        });
        expect(res.body.logs[1].deviceLabel).toBeNull();
      });
    });

    it("is scoped to siteId", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).get(`/devices/logs?siteId=${w.S2}`).set(bearer(w.master));
        expect(res.body.logs.map((l) => l.id)).toEqual([w.foreign]);
        const none = await request(app).get(`/devices/logs?siteId=${w.S2 + 100000}`).set(bearer(w.master));
        expect(none.body).toEqual({ logs: [] });
      });
    });

    it("siteId is required", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        for (const url of ["/devices/logs", "/devices/logs?siteId=abc", "/devices/logs?siteId=0"]) {
          expect((await request(app).get(url).set(bearer(w.master))).status).toBe(400);
        }
      });
    });

    it("does not accept a download ticket (a session is needed)", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        expect((await request(app).get(`/devices/logs?siteId=${w.S1}&ticket=${ticketOf(w.master)}`)).status).toBe(401);
      });
    });
  });

  describe("GET /devices/logs/:id/view", () => {
    it("streams the file gunzipped as text/plain; charset=utf-8", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).get(`/devices/logs/${w.newer}/view`).set(bearer(w.master));
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
        expect(res.text).toBe(TEXT);
      });
    });

    it("accepts ?ticket= so it opens in a new tab, and writes a device_log_view audit row", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).get(`/devices/logs/${w.older}/view?ticket=${ticketOf(w.master)}`);
        expect(res.status).toBe(200);
        expect(res.text).toBe(TEXT);
        const rows = await audit(q, "device_log_view", w.older);
        expect(rows).toHaveLength(1);
        expect(rows[0].user_id).toBe(w.master.id);
        expect(await audit(q, "device_log_download", w.older)).toHaveLength(0);
      });
    });
  });

  describe("GET /devices/logs/:id/download", () => {
    it("sends the stored .gz as application/gzip with an attachment filename", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).get(`/devices/logs/${w.newer}/download`).set(bearer(w.master)).buffer(true).parse(binary);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("application/gzip");
        expect(res.headers["content-disposition"]).toBe('attachment; filename="app.2026-11-09.0.log.gz"');
        expect(res.body).toEqual(GZ);
        expect(zlib.gunzipSync(res.body).toString("utf8")).toBe(TEXT);
      });
    });

    it("accepts ?ticket= and writes a device_log_download audit row", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).get(`/devices/logs/${w.other}/download?ticket=${ticketOf(w.master)}`).buffer(true).parse(binary);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GZ);
        const rows = await audit(q, "device_log_download", w.other);
        expect(rows).toHaveLength(1);
        expect(rows[0].user_id).toBe(w.master.id);
        expect(await audit(q, "device_log_view", w.other)).toHaveLength(0);
      });
    });
  });

  describe("an unknown id is 404", () => {
    it("for a missing row, a malformed id, and a row whose file is gone, with no audit row", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const h = bearer(w.master);
        for (const kind of ["view", "download"]) {
          expect((await request(app).get(`/devices/logs/${w.missing + 100000}/${kind}`).set(h)).status).toBe(404);
          expect((await request(app).get(`/devices/logs/abc/${kind}`).set(h)).status).toBe(404);
          expect((await request(app).get(`/devices/logs/0/${kind}`).set(h)).status).toBe(404);
          expect((await request(app).get(`/devices/logs/${w.missing}/${kind}`).set(h)).status).toBe(404);
        }
        expect(await audit(q, "device_log_view", w.missing)).toHaveLength(0);
        expect(await audit(q, "device_log_download", w.missing)).toHaveLength(0);
      });
    });
  });
});
