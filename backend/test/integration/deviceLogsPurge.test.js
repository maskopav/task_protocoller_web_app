// Device log retention (docs/device_logs/01_spec.md §4, §8) against a real MariaDB:
// 90-day age limit, total cap oldest first, a missing file still drops its row.
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";

const hold = { q: null };
vi.mock("../../src/db/queryHelper.js", () => ({
  executeQuery: (sql, params = []) => hold.q(sql, params),
  executeTransaction: async (cb) => cb({ query: async (sql, params = []) => [await hold.q(sql, params)] }),
}));
vi.mock("../../src/utils/logger.js", () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const dbUp = await testDbAvailable();
afterAll(closeTestDb);
const { purgeDeviceLogs } = await import("../../src/deviceLogs/purge.js");
const { LocalFileStore } = await import("../../src/storage/fileStore.js");
const { toDbDate } = await import("../../src/upload/ingestService.js");

const DAY = 864e5;
const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (days) => toDbDate(new Date(NOW.getTime() - days * DAY));

let dataPath, store;
beforeAll(() => {
  dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "device-logs-purge-"));
  store = new LocalFileStore(dataPath);
});
afterAll(() => fs.rmSync(dataPath, { recursive: true, force: true }));

async function world(q) {
  const t = crypto.randomBytes(4).toString("hex");
  const site = (await q(`INSERT INTO sites (name, access_token) VALUES (?, ?)`, [`S_${t}`, crypto.randomBytes(16).toString("hex")])).insertId;
  const deviceId = (await q(`INSERT INTO devices (installation_id, site_id) VALUES (?, ?)`, [`dev-${t}`, site])).insertId;
  return { site, deviceId };
}

// A row and (unless `missing`) its file, as ingest would have left them.
async function addLog(q, w, { daysAgo, bytes = 10, missing = false }) {
  const sha = crypto.randomBytes(32).toString("hex");
  const key = store.deviceLogKey(w.deviceId, sha);
  if (!missing) {
    fs.mkdirSync(path.dirname(store.resolve(key)), { recursive: true });
    fs.writeFileSync(store.resolve(key), "x");
  }
  const id = (await q(
    `INSERT INTO device_logs (device_id, site_id, file_name, sha256, bytes, utc_offset, app_version, received_at)
     VALUES (?, ?, 'app.2026-01-01.0.log.gz', ?, ?, '+00:00', '1.0', ?)`,
    [w.deviceId, w.site, sha, bytes, ago(daysAgo)]
  )).insertId;
  return { id, key, exists: () => fs.existsSync(store.resolve(key)) };
}

const ids = async (q, w) => (await q(`SELECT id FROM device_logs WHERE device_id = ? ORDER BY id`, [w.deviceId])).map((r) => r.id);
const opts = (over = {}) => ({ store, retentionDays: 90, totalMaxBytes: 2 ** 40, now: () => NOW, ...over });

describe.skipIf(!dbUp)("purgeDeviceLogs", () => {
  it("deletes a 91-day-old row and its file, keeps an 89-day-old one", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const old = await addLog(q, w, { daysAgo: 91 });
      const fresh = await addLog(q, w, { daysAgo: 89 });
      const counts = await purgeDeviceLogs(opts());
      expect(counts).toEqual({ expired: 1, overCap: 0, failed: 0 });
      expect(await ids(q, w)).toEqual([fresh.id]);
      expect(old.exists()).toBe(false);
      expect(fresh.exists()).toBe(true);
    });
  });

  it("honours DEVICE_LOG_RETENTION_DAYS", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const a = await addLog(q, w, { daysAgo: 8 });
      const b = await addLog(q, w, { daysAgo: 6 });
      await purgeDeviceLogs(opts({ retentionDays: 7 }));
      expect(await ids(q, w)).toEqual([b.id]);
      expect(a.exists()).toBe(false);
    });
  });

  it("over the total cap it deletes the oldest first, by received_at and then id, until under the cap", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const [{ base }] = await q(`SELECT COALESCE(SUM(bytes), 0) AS base FROM device_logs`);
      // inserted out of order on purpose: id order differs from age order
      const mid = await addLog(q, w, { daysAgo: 20, bytes: 100 });
      const oldest = await addLog(q, w, { daysAgo: 30, bytes: 100 });
      const tieA = await addLog(q, w, { daysAgo: 10, bytes: 100 });
      const tieB = await addLog(q, w, { daysAgo: 10, bytes: 100 });
      // total 400 over the cap of 250: the two oldest go (200 freed), tieA and tieB stay
      const counts = await purgeDeviceLogs(opts({ totalMaxBytes: Number(base) + 250 }));
      expect(counts).toEqual({ expired: 0, overCap: 2, failed: 0 });
      expect(await ids(q, w)).toEqual([tieA.id, tieB.id]);
      expect(oldest.exists()).toBe(false);
      expect(mid.exists()).toBe(false);
      expect(tieA.exists() && tieB.exists()).toBe(true);
    });
  });

  it("the equal-age tie goes by id", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const [{ base }] = await q(`SELECT COALESCE(SUM(bytes), 0) AS base FROM device_logs`);
      const first = await addLog(q, w, { daysAgo: 5, bytes: 100 });
      const second = await addLog(q, w, { daysAgo: 5, bytes: 100 });
      await purgeDeviceLogs(opts({ totalMaxBytes: Number(base) + 100 }));
      expect(await ids(q, w)).toEqual([second.id]);
      expect(first.exists()).toBe(false);
    });
  });

  it("nothing is deleted at or under the cap", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const [{ base }] = await q(`SELECT COALESCE(SUM(bytes), 0) AS base FROM device_logs`);
      await addLog(q, w, { daysAgo: 5, bytes: 100 });
      await addLog(q, w, { daysAgo: 6, bytes: 100 });
      const counts = await purgeDeviceLogs(opts({ totalMaxBytes: Number(base) + 200 }));
      expect(counts).toEqual({ expired: 0, overCap: 0, failed: 0 });
      expect(await ids(q, w)).toHaveLength(2);
    });
  });

  it("a missing file is not an error: the row is still deleted (age and cap)", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const [{ base }] = await q(`SELECT COALESCE(SUM(bytes), 0) AS base FROM device_logs`);
      await addLog(q, w, { daysAgo: 120, missing: true });
      const capped = await addLog(q, w, { daysAgo: 30, bytes: 100, missing: true });
      const kept = await addLog(q, w, { daysAgo: 1, bytes: 100 });
      const counts = await purgeDeviceLogs(opts({ totalMaxBytes: Number(base) + 100 }));
      expect(counts).toEqual({ expired: 1, overCap: 1, failed: 0 });
      expect(await ids(q, w)).toEqual([kept.id]);
      expect(capped.exists()).toBe(false);
    });
  });

  it("removes a computer's folder once its last file is gone", async () => {
    await withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const old = await addLog(q, w, { daysAgo: 100 });
      const dir = path.dirname(store.resolve(old.key));
      expect(fs.existsSync(dir)).toBe(true);
      await purgeDeviceLogs(opts());
      expect(fs.existsSync(dir)).toBe(false);
    });
  });
});
