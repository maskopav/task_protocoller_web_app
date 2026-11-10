// POST /device-logs against a real MariaDB (docs/device_logs/01_spec.md §2, §3, §7, §8).
// The router's own queries run inside a rolled-back transaction (queryHelper is
// replaced by a shim that forwards to the test connection), and the files go to
// a throwaway DATA_PATH.
import { describe, it, expect, afterAll, beforeAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";

const hold = { q: null };
vi.mock("../../src/db/queryHelper.js", () => ({
  executeQuery: (sql, params = []) => hold.q(sql, params),
  // like the real helper, a failing callback undoes its own writes (savepoint inside the test's outer transaction)
  executeTransaction: async (cb) => {
    await hold.q("SAVEPOINT tx_shim", []);
    try {
      const out = await cb({ query: async (sql, params = []) => [await hold.q(sql, params)] });
      await hold.q("RELEASE SAVEPOINT tx_shim", []);
      return out;
    } catch (e) {
      await hold.q("ROLLBACK TO SAVEPOINT tx_shim", []);
      throw e;
    }
  },
}));
vi.mock("../../src/utils/logger.js", () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const dbUp = await testDbAvailable();
afterAll(closeTestDb);
const { createDeviceLogRouter } = await import("../../src/routes/deviceLogs.js");
const { LocalFileStore } = await import("../../src/storage/fileStore.js");
const { ensureDataPath } = await import("../../src/config/uploads.js");
const { logToFile } = await import("../../src/utils/logger.js");

const tag = () => crypto.randomBytes(4).toString("hex");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const CONTENT = "2026-11-09 10:00:00.123 INFO  app started\n2026-11-09 10:00:01.000 INFO  config refreshed\n";
const gz = (text = CONTENT) => zlib.gzipSync(Buffer.from(text));

let dataPath, store, app;
const tmpFiles = () => fs.readdirSync(path.join(dataPath, "tmp"));
const storedFiles = () => {
  const root = path.join(dataPath, "device-logs");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true }).filter((f) => f.endsWith(".log.gz"));
};
const makeApp = (opts = {}) => {
  const a = express();
  a.use("/device-logs", createDeviceLogRouter({ store, maxBytes: 5 * 1024 * 1024, limits: { minFreeBytes: 0 }, ...opts }));
  return a;
};

beforeAll(() => {
  dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "device-logs-"));
  ensureDataPath(dataPath);
  store = new LocalFileStore(dataPath);
});
afterAll(() => fs.rmSync(dataPath, { recursive: true, force: true }));
beforeEach(() => {
  app = makeApp();
  fs.rmSync(path.join(dataPath, "device-logs"), { recursive: true, force: true });
  logToFile.mockClear();
});
afterEach(() => {
  // §8: the tmp file is removed on every outcome, success and failure alike.
  expect(tmpFiles()).toEqual([]);
});

async function world(q) {
  const t = tag();
  const token = crypto.randomBytes(16).toString("hex");
  const S1 = (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`S1_${t}`, token])).insertId;
  const S2 = (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`S2_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const inactiveToken = crypto.randomBytes(16).toString("hex");
  await q(`INSERT INTO sites (name, access_token, is_active) VALUES (?, ?, 0)`, [`S3_${t}`, inactiveToken]);
  const installationId = `dev-${t}`;
  const deviceId = (await q(`INSERT INTO devices (installation_id, site_id) VALUES (?, ?)`, [installationId, S1])).insertId;
  const foreignId = `foreign-${t}`;
  await q(`INSERT INTO devices (installation_id, site_id) VALUES (?, ?)`, [foreignId, S2]);
  const orphanId = `orphan-${t}`;
  await q(`INSERT INTO devices (installation_id, site_id) VALUES (?, NULL)`, [orphanId]);
  return { t, token, S1, S2, inactiveToken, installationId, deviceId, foreignId, orphanId };
}

// Text parts first, the file last, the way the desktop app sends them.
const post = (w, { buf = gz(), over = {}, a = app, clientName = "patient_secret.gz" } = {}) => {
  const parts = {
    siteToken: w.token, installationId: w.installationId, appVersion: "1.4.0", utcOffset: "+01:00",
    fileName: "app.2026-11-09.0.log.gz", sha256: sha(buf), ...over,
  };
  const req = request(a).post("/device-logs");
  for (const [k, v] of Object.entries(parts)) if (v !== undefined) req.field(k, v);
  return req.attach("file", buf, { filename: clientName, contentType: "application/gzip" });
};

const rows = (q, deviceId) => q(`SELECT * FROM device_logs WHERE device_id = ?`, [deviceId]);

describe.skipIf(!dbUp)("POST /device-logs", () => {
  it("200: stores the file at DATA_PATH/device-logs/<device_id>/<sha256>.log.gz and records the row", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const buf = gz();
      const res = await post(w, { buf });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok", sha256: sha(buf), bytes: buf.length, receivedAt: expect.stringMatching(/Z$/) });
      expect(res.body.duplicate).toBeUndefined();

      const target = path.join(dataPath, "device-logs", String(w.deviceId), `${sha(buf)}.log.gz`);
      expect(fs.readFileSync(target)).toEqual(buf);
      expect(storedFiles()).toHaveLength(1);

      const [row] = await rows(q, w.deviceId);
      expect(row).toMatchObject({
        site_id: w.S1, file_name: "app.2026-11-09.0.log.gz", sha256: sha(buf), utc_offset: "+01:00", app_version: "1.4.0",
      });
      expect(Number(row.bytes)).toBe(buf.length);
      expect(new Date(`${row.received_at.replace(" ", "T")}Z`).toISOString()).toBe(res.body.receivedAt);
    });
  });

  it("200 + duplicate on a resend: same receipt, no second row, no second file", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const first = await post(w);
      const second = await post(w);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ ...first.body, duplicate: true });
      expect(await rows(q, w.deviceId)).toHaveLength(1);
      expect(storedFiles()).toHaveLength(1);
    });
  });

  it("the same bytes from another computer are a separate log (the key is device + sha256)", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const other = `dev2-${w.t}`;
      await q(`INSERT INTO devices (installation_id, site_id) VALUES (?, ?)`, [other, w.S1]);
      await post(w);
      const res = await post(w, { over: { installationId: other } });
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBeUndefined();
      expect(storedFiles()).toHaveLength(2);
    });
  });

  describe("400 bad_request", () => {
    const cases = {
      "installationId with a bad character": { over: { installationId: "dev/../x" } },
      "appVersion with a control character": { over: { appVersion: "1.4\n0" } },
      "appVersion longer than 32": { over: { appVersion: "x".repeat(33) } },
      "utcOffset without a colon": { over: { utcOffset: "+0100" } },
      "fileName that is not a rotated log": { over: { fileName: "app.log" } },
      "fileName with a path": { over: { fileName: "../app.2026-11-09.0.log.gz" } },
      "sha256 in upper case": { over: { sha256: "A".repeat(64) } },
      "missing part": { over: { utcOffset: undefined } },
    };
    for (const [name, c] of Object.entries(cases)) {
      it(name, async () => {
        await withRollback(async (q) => {
          hold.q = q;
          const w = await world(q);
          const res = await post(w, c);
          expect(res.status).toBe(400);
          expect(res.body).toEqual({ error: "bad_request" });
          expect(await rows(q, w.deviceId)).toHaveLength(0);
          expect(storedFiles()).toEqual([]);
        });
      });
    }

    it("an unknown part", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await post(w, { over: { extra: "1" } });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "bad_request" });
      });
    });

    it("a duplicated part", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const buf = gz();
        const res = await request(app).post("/device-logs")
          .field("siteToken", w.token).field("installationId", w.installationId).field("installationId", w.installationId)
          .field("appVersion", "1.4.0").field("utcOffset", "+01:00").field("fileName", "app.2026-11-09.0.log.gz")
          .field("sha256", sha(buf)).attach("file", buf, "x.gz");
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "bad_request" });
      });
    });

    it("a text part after file", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const buf = gz();
        const res = await request(app).post("/device-logs")
          .field("siteToken", w.token).field("installationId", w.installationId).field("appVersion", "1.4.0")
          .field("utcOffset", "+01:00").field("fileName", "app.2026-11-09.0.log.gz")
          .attach("file", buf, "x.gz")
          .field("sha256", sha(buf));
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "bad_request" });
        expect(await rows(q, w.deviceId)).toHaveLength(0);
      });
    });

    it("no file part", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await request(app).post("/device-logs")
          .field("siteToken", w.token).field("installationId", w.installationId).field("appVersion", "1.4.0")
          .field("utcOffset", "+01:00").field("fileName", "app.2026-11-09.0.log.gz").field("sha256", "0".repeat(64));
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "bad_request" });
      });
    });

    it("a body that is not multipart", async () => {
      const res = await request(app).post("/device-logs").send({ siteToken: "x" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "bad_request" });
    });
  });

  it("a malformed siteToken (too short, illegal character) is 404 invalid_token, not 400, and leaves no tmp file", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      for (const siteToken of ["short", `${w.token.slice(0, 20)}!${w.token.slice(21)}`, "x".repeat(65)]) {
        const res = await post(w, { over: { siteToken } });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "invalid_token" });
        expect(tmpFiles()).toEqual([]);
      }
      expect(await rows(q, w.deviceId)).toHaveLength(0);
      expect(storedFiles()).toEqual([]);
      // another malformed part next to a bad token is still 400
      expect((await post(w, { over: { siteToken: "short", utcOffset: "x" } })).status).toBe(400);
      // a missing siteToken stays 400
      expect((await post(w, { over: { siteToken: undefined } })).status).toBe(400);
    });
  });

  it("400 not_gzip: the first two bytes are not 1f 8b (checked before the hash)", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const buf = Buffer.from("plain text, not gzip");
      const res = await post(w, { buf, over: { sha256: "0".repeat(64) } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "not_gzip" });
      expect(await rows(q, w.deviceId)).toHaveLength(0);
    });
  });

  it("400 not_gzip for a one-byte file", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const res = await post(w, { buf: Buffer.from([0x1f]) });
      expect(res.body).toEqual({ error: "not_gzip" });
    });
  });

  it("400 checksum_mismatch: the declared sha256 is not the file's", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const res = await post(w, { over: { sha256: "0".repeat(64) } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "checksum_mismatch" });
      expect(await rows(q, w.deviceId)).toHaveLength(0);
      expect(storedFiles()).toEqual([]);
    });
  });

  it("413 too_large: a file over DEVICE_LOG_MAX_BYTES, and exactly the limit is accepted", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const big = zlib.gzipSync(crypto.randomBytes(4000));
      const small = makeApp({ maxBytes: 1024 });
      const res = await post(w, { buf: big, a: small });
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: "too_large" });
      expect(await rows(q, w.deviceId)).toHaveLength(0);

      const exact = makeApp({ maxBytes: big.length });
      expect((await post(w, { buf: big, a: exact })).status).toBe(200);
    });
  });

  describe("404 / 409: the token and the device", () => {
    it("404 invalid_token for an unknown token", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await post(w, { over: { siteToken: "n".repeat(32) } });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "invalid_token" });
        expect(storedFiles()).toEqual([]);
      });
    });

    it("404 invalid_token for a deactivated clinic", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await post(w, { over: { siteToken: w.inactiveToken } });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "invalid_token" });
      });
    });

    it("404 device_not_registered for an unknown computer, and no device is created", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await post(w, { over: { installationId: `new-${w.t}` } });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "device_not_registered" });
        expect(await q(`SELECT id FROM devices WHERE installation_id = ?`, [`new-${w.t}`])).toHaveLength(0);
      });
    });

    it("404 device_not_registered for a computer without a clinic, which is not adopted", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await post(w, { over: { installationId: w.orphanId } });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "device_not_registered" });
        const [d] = await q(`SELECT site_id FROM devices WHERE installation_id = ?`, [w.orphanId]);
        expect(d.site_id).toBeNull();
      });
    });

    it("409 device_belongs_to_another_site", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const res = await post(w, { over: { installationId: w.foreignId } });
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: "device_belongs_to_another_site" });
        expect(storedFiles()).toEqual([]);
      });
    });
  });

  it("507 insufficient_storage below the free-space floor, as for /upload", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const res = await post(w, { a: makeApp({ limits: { minFreeBytes: Number.MAX_SAFE_INTEGER } }) });
      expect(res.status).toBe(507);
      expect(res.body).toEqual({ error: "insufficient_storage" });
      expect(await rows(q, w.deviceId)).toHaveLength(0);
    });
  });

  it("429 after 120 requests per IP and window", async () => {
    const limited = makeApp();
    for (let i = 0; i < 120; i++) {
      const res = await request(limited).post("/device-logs").send({});
      expect(res.status).toBe(400);
    }
    const res = await request(limited).post("/device-logs").send({});
    expect(res.status).toBe(429);
  });

  describe("500 internal", () => {
    it("a store failure answers 500, leaves no row and no tmp file, and logs route, status and device id only", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const spy = vi.spyOn(store, "commit").mockRejectedValueOnce(Object.assign(new Error(`disk broke for ${w.token}`), { code: "EIO" }));
        try {
          const res = await post(w);
          expect(res.status).toBe(500);
          expect(res.body).toEqual({ error: "internal" });
        } finally {
          spy.mockRestore();
        }
        expect(await rows(q, w.deviceId)).toHaveLength(0);
        expect(storedFiles()).toEqual([]);

        // §7: the log names the route, the status and the device id.
        expect(logToFile).toHaveBeenCalledTimes(1);
        const [, , details] = logToFile.mock.calls[0];
        expect(details).toEqual({ route: "POST /device-logs", status: 500, deviceId: w.deviceId, code: "EIO" });
      });
    });

    it("a failure to create the tmp folder is 500 internal (never 400, which the app reads as never-retry), with no leftovers", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const fsp = (await import("fs/promises")).default;
        const real = fsp.mkdir.bind(fsp);
        const spy = vi.spyOn(fsp, "mkdir").mockImplementation((p, o) =>
          String(p).endsWith("tmp") ? Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" })) : real(p, o));
        try {
          const res = await post(w);
          expect(res.status).toBe(500);
          expect(res.body).toEqual({ error: "internal" });
        } finally {
          spy.mockRestore();
        }
        expect(await rows(q, w.deviceId)).toHaveLength(0);
        expect(storedFiles()).toEqual([]);
      });
    });

    it("no log line ever carries the token, the file content or the client filename", async () => {
      await withRollback(async (q) => {
        hold.q = q;
        const w = await world(q);
        const spy = vi.spyOn(store, "commit").mockRejectedValue(new Error(`boom ${w.token} ${CONTENT}`));
        try {
          await post(w, { clientName: "Jane_Doe_secret.log.gz" });
          await post(w, { over: { siteToken: "n".repeat(32) } });
          await post(w, { over: { utcOffset: "bad" } });
        } finally {
          spy.mockRestore();
        }
        const logged = JSON.stringify(logToFile.mock.calls);
        for (const secret of [w.token, "Jane_Doe", "app started", "app.2026-11-09.0.log.gz"]) {
          expect(logged).not.toContain(secret);
        }
      });
    });
  });
});
