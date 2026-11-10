// src/deviceLogs/ingest.js
// Rules: docs/device_logs/01_spec.md §2.2 (steps 3-8).
//
// Decides and records the outcome of one received log file. From the moment it
// is called it owns the temp file: the file is either committed or discarded
// before this returns or throws.
import fsp from "fs/promises";
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { belongsToOtherSite } from "../controllers/deviceController.js";
import { DEFAULT_LIMITS, toDbDate } from "../upload/ingestService.js";

const DUP_KEY = "ER_DUP_ENTRY";
const GZIP_MAGIC = [0x1f, 0x8b];

// DATETIME has whole seconds. The receipt is cut to the same precision, so a
// resend returns exactly the receivedAt of the first answer.
const wholeSecond = (d) => new Date(Math.floor(d.getTime() / 1000) * 1000);
const fromDbDate = (s) => (s instanceof Date ? s : new Date(`${String(s).replace(" ", "T")}Z`)).toISOString();

const receipt = (row) => ({
  status: "ok",
  sha256: row.sha256,
  bytes: Number(row.bytes),
  receivedAt: fromDbDate(row.received_at),
});

async function isGzip(file) {
  const fh = await fsp.open(file, "r");
  try {
    const buf = Buffer.alloc(2);
    const { bytesRead } = await fh.read(buf, 0, 2, 0);
    return bytesRead === 2 && buf[0] === GZIP_MAGIC[0] && buf[1] === GZIP_MAGIC[1];
  } finally {
    await fh.close();
  }
}

// Step 6. The stored receipt for (device, sha256), or null.
async function findExisting(deviceId, sha256) {
  const rows = await executeQuery(
    `SELECT sha256, bytes, received_at FROM device_logs WHERE device_id = ? AND sha256 = ?`,
    [deviceId, sha256]
  );
  return rows.length > 0 ? { httpCode: 200, body: { ...receipt(rows[0]), duplicate: true } } : null;
}

// Step 7. The row is inserted before the file is linked, so a concurrent
// request for the same (device, sha256) fails on the unique key before it can
// reach the store.
async function commit(store, { deviceId, siteId, fields, file, at }) {
  const key = store.deviceLogKey(deviceId, file.sha256);
  await executeTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO device_logs (device_id, site_id, file_name, sha256, bytes, utc_offset, app_version, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [deviceId, siteId, fields.fileName, file.sha256, file.bytes, fields.utcOffset, fields.appVersion, toDbDate(at)]
    );
    try {
      await store.commit(file.tempPath, key);
    } catch (err) {
      // A file without a row (a crash between linking and the DB commit): the
      // key is the content hash, so it already holds exactly these bytes.
      if (err?.code !== "EEXIST") throw err;
    }
  });
}

/**
 * @param {Awaited<ReturnType<import('../upload/multipartReceiver.js').receiveDeviceLog>>} upload
 * @param {{store: import('../storage/fileStore.js').LocalFileStore,
 *          now?: () => Date, limits?: {minFreeBytes: number}}} deps
 * @returns {Promise<{httpCode: number, body: object}>}  throws on a server failure,
 *   with `deviceId` attached to the error once the device is known
 */
export async function ingestDeviceLog(upload, { store, now = () => new Date(), limits = DEFAULT_LIMITS }) {
  const { fields, file } = upload;
  const at = wholeSecond(now());
  let deviceId = null;
  try {
    // Step 3
    if (!(await isGzip(file.tempPath))) return { httpCode: 400, body: { error: "not_gzip" } };
    if (file.sha256 !== fields.sha256) return { httpCode: 400, body: { error: "checksum_mismatch" } };

    // Same free-space rule as /upload: the file sits in tmp/ already.
    const fsStat = await fsp.statfs(store.root).catch(() => null);
    if (fsStat && fsStat.bavail * fsStat.bsize < limits.minFreeBytes) {
      return { httpCode: 507, body: { error: "insufficient_storage" } };
    }

    // Step 4
    const [site] = await executeQuery(`SELECT id FROM sites WHERE access_token = ? AND is_active = 1`, [fields.siteToken]);
    if (!site) return { httpCode: 404, body: { error: "invalid_token" } };

    // Step 5. This endpoint never creates or adopts a device.
    const [device] = await executeQuery(`SELECT id, site_id FROM devices WHERE installation_id = ?`, [fields.installationId]);
    if (!device || device.site_id == null) return { httpCode: 404, body: { error: "device_not_registered" } };
    deviceId = device.id;
    if (await belongsToOtherSite(fields.installationId, site.id)) {
      return { httpCode: 409, body: { error: "device_belongs_to_another_site" } };
    }

    // Steps 6-7: two rounds at most. A duplicate key on insert means a
    // concurrent request committed the same file in between.
    for (let round = 0; ; round++) {
      const existing = await findExisting(deviceId, file.sha256);
      if (existing) return existing;
      try {
        await commit(store, { deviceId, siteId: site.id, fields, file, at });
      } catch (err) {
        if (err?.code === DUP_KEY && round === 0) continue;
        throw err;
      }
      return { httpCode: 200, body: { status: "ok", sha256: file.sha256, bytes: file.bytes, receivedAt: at.toISOString() } };
    }
  } catch (err) {
    if (err && typeof err === "object") err.deviceId = deviceId;
    throw err;
  } finally {
    // A no-op after a successful commit (the temp name is gone by then).
    await store.discardTemp(file.tempPath).catch(() => {});
  }
}
