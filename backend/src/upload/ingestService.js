// src/upload/ingestService.js
// Rules: docs/upload_management/specification.md §3.2–3.3.
import fsp from "fs/promises";
import { executeQuery, executeTransaction } from "../db/queryHelper.js";

const DUP_KEY = "ER_DUP_ENTRY";

// Thrown inside the commit transaction (so the device upsert rolls back too)
// when a quarantined upload would exceed the quarantine limits.
class QuarantineFull extends Error {}

export const DEFAULT_LIMITS = { quarantineMaxBytes: 20 * 1024 ** 3, quarantineMaxPerDevice: 50, minFreeBytes: 5 * 1024 ** 3 };

// DATETIME(3) literal in UTC, the format the pool (timezone 'Z',
// dateStrings) reads and writes.
export const toDbDate = (d) => d.toISOString().replace("T", " ").replace("Z", "");
const fromDbDate = (s) => (s instanceof Date ? s : new Date(`${String(s).replace(" ", "T")}Z`)).toISOString();

const receipt = (row) => ({
  status: "ok",
  sessionId: row.session_id,
  bytes: Number(row.bytes),
  sha256: row.zip_sha256,
  receivedAt: fromDbDate(row.received_at),
});

async function recordAttempt(run, { sessionId, installationId, at, httpCode, outcome, bytes, shaDeclared, shaComputed }) {
  await run(
    `INSERT INTO upload_attempts (session_id, installation_id, at, http_code, outcome, bytes, sha_declared, sha_computed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, installationId ?? null, toDbDate(at), httpCode, outcome, bytes ?? null, shaDeclared ?? null, shaComputed ?? null]
  );
}

/**
 * Records the attempt for a request the receiver rejected (400). The receiver
 * attaches only identifiers that passed their format check, and a request
 * without a valid sessionId leaves no row (spec §3.3).
 *
 * @param {import('./multipartReceiver.js').UploadRequestError & {attempt?: {sessionId: string|null, installationId: string|null, zipSha256: string|null}}} err
 */
export async function recordRejectedAttempt(err, now = () => new Date()) {
  const a = err.attempt;
  if (!a?.sessionId) return;
  await recordAttempt(executeQuery, {
    sessionId: a.sessionId, installationId: a.installationId, at: now(),
    httpCode: err.httpCode, outcome: "error", shaDeclared: a.zipSha256,
  });
}

// Step 3. Returns the response for an existing session, or null.
async function resolveExisting(fields, file, at) {
  const rows = await executeQuery(
    `SELECT id, session_id, site_id, bytes, zip_sha256, received_at FROM upload_sessions WHERE session_id = ?`,
    [fields.sessionId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const attempt = {
    sessionId: fields.sessionId, installationId: fields.installationId, at,
    bytes: file.bytes, shaDeclared: fields.zipSha256, shaComputed: file.sha256,
  };
  if (row.zip_sha256 !== file.sha256) {
    await recordAttempt(executeQuery, { ...attempt, httpCode: 409, outcome: "conflict" });
    return { httpCode: 409, body: { error: "session_exists" } };
  }
  // In SQL, not read-modify-write: validation may rewrite flags concurrently
  // (validationQueue keeps a 'duplicate' set here while it ran).
  await executeQuery(
    `UPDATE upload_sessions SET flags = JSON_ARRAY_APPEND(flags, '$', 'duplicate')
     WHERE id = ? AND NOT JSON_CONTAINS(flags, '"duplicate"')`,
    [row.id]
  );
  // A re-send of a quarantined session gets the same answer as the first
  // upload did. A 200 would tell the device it was accepted while a master
  // still has to assign it.
  if (row.site_id == null) {
    await recordAttempt(executeQuery, { ...attempt, httpCode: 404, outcome: "quarantined" });
    return { httpCode: 404, body: { error: "device_not_registered", quarantined: true } };
  }
  await recordAttempt(executeQuery, { ...attempt, httpCode: 200, outcome: "resent" });
  return { httpCode: 200, body: receipt(row) };
}

// Step 4. Returns {deviceId, siteId}; siteId null means quarantine.
async function resolveDevice(conn, { installationId, siteToken, appVersion }, at) {
  const q = async (sql, params) => (await conn.query(sql, params))[0];
  const seen = toDbDate(at);

  let site = null;
  if (siteToken) {
    [site] = await q(`SELECT id FROM sites WHERE access_token = ? AND is_active = 1`, [siteToken]);
  }

  if (site) {
    // A token adopts a device that has no site yet, but never moves one that
    // belongs to another clinic: any clinic's token holder could otherwise
    // pull a foreign device (and its later tokenless uploads) into their own
    // scope. Moving a device between sites is the master's PUT /devices/:id/site.
    await q(
      `INSERT INTO devices (installation_id, site_id, app_version, last_seen_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE site_id = COALESCE(site_id, VALUES(site_id)),
         app_version = COALESCE(VALUES(app_version), app_version), last_seen_at = VALUES(last_seen_at)`,
      [installationId, site.id, appVersion ?? null, seen]
    );
  } else {
    // No usable token: never touch site_id. An unknown device is still
    // created (site NULL), because the quarantined session must point at it.
    await q(
      `INSERT INTO devices (installation_id, app_version, last_seen_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE app_version = COALESCE(VALUES(app_version), app_version), last_seen_at = VALUES(last_seen_at)`,
      [installationId, appVersion ?? null, seen]
    );
  }
  const [device] = await q(`SELECT id, site_id FROM devices WHERE installation_id = ?`, [installationId]);
  // An invalid or inactive token quarantines even a known device, and so does
  // a valid token of a different site than the device's. The device's own
  // site is used only when no token was sent.
  const siteId = site
    ? (device.site_id === site.id ? site.id : null)
    : siteToken ? null : device.site_id ?? null;
  return { deviceId: device.id, siteId };
}

// Step 5. The row is inserted before the file is linked, so a concurrent
// request for the same sessionId fails on the unique key (and goes back to
// step 3) before it can reach the store. commit() refuses to overwrite anyway.
async function commitSession(store, fields, file, at, limits) {
  return executeTransaction(async (conn) => {
    const { deviceId, siteId } = await resolveDevice(conn, fields, at);
    const quarantined = siteId === null;
    if (quarantined) {
      const [q] = (await conn.query(
        `SELECT COALESCE(SUM(bytes), 0) AS total, COALESCE(SUM(device_id = ?), 0) AS mine
         FROM upload_sessions WHERE site_id IS NULL`,
        [deviceId]
      ))[0];
      if (Number(q.total) + file.bytes > limits.quarantineMaxBytes || Number(q.mine) >= limits.quarantineMaxPerDevice) {
        throw new QuarantineFull();
      }
    }
    const key = store.sessionKey(fields.sessionId);
    const [res] = await conn.query(
      `INSERT INTO upload_sessions
         (session_id, device_id, site_id, app_version, received_at, bytes, zip_sha256, storage_path, status, invalid_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fields.sessionId, deviceId, siteId, fields.appVersion ?? null, toDbDate(at), file.bytes, file.sha256, key,
        quarantined ? "invalid" : "validating", quarantined ? "unknown_device" : null]
    );
    await recordAttempt((sql, params) => conn.query(sql, params), {
      sessionId: fields.sessionId, installationId: fields.installationId, at,
      httpCode: quarantined ? 404 : 200, outcome: quarantined ? "quarantined" : "accepted",
      bytes: file.bytes, shaDeclared: fields.zipSha256, shaComputed: file.sha256,
    });
    try {
      await store.commit(file.tempPath, key);
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      // A file without a row: an earlier upload crashed between linking the
      // file and committing this transaction. The row we just inserted holds
      // the unique key, so no accepted session can own that file. It is an
      // orphan, and replacing it is the only way this session can ever land.
      await store.replaceOrphan(file.tempPath, key);
    }
    return { id: res.insertId, quarantined };
  });
}

/**
 * Decides and records the outcome of one received upload: checksum,
 * idempotency, device/site resolution, quarantine, commit, and the attempt row.
 * From here on it owns the temp file: the file is either committed or discarded
 * before this returns.
 *
 * @param {Awaited<ReturnType<import('./multipartReceiver.js').receiveUpload>>} upload
 * @param {{store: import('../storage/fileStore.js').LocalFileStore,
 *          queue: {enqueue: (uploadSessionId: number) => void},
 *          now?: () => Date}} deps
 * @returns {Promise<{httpCode: number, body: object}>}
 */
export async function ingestUpload(upload, { store, queue, now = () => new Date(), limits = DEFAULT_LIMITS }) {
  const { fields, file } = upload;
  const at = now();
  try {
    if (file.sha256 !== fields.zipSha256) {
      await recordAttempt(executeQuery, {
        sessionId: fields.sessionId, installationId: fields.installationId, at, httpCode: 400,
        outcome: "checksum", bytes: file.bytes, shaDeclared: fields.zipSha256, shaComputed: file.sha256,
      });
      return { httpCode: 400, body: { error: "checksum_mismatch" } };
    }

    // The upload already sits in tmp/, on the same filesystem, so free space
    // left now is what remains after keeping it.
    const fsStat = await fsp.statfs(store.root).catch(() => null);
    if (fsStat && fsStat.bavail * fsStat.bsize < limits.minFreeBytes) {
      await recordAttempt(executeQuery, {
        sessionId: fields.sessionId, installationId: fields.installationId, at, httpCode: 507,
        outcome: "disk_full", bytes: file.bytes, shaDeclared: fields.zipSha256, shaComputed: file.sha256,
      });
      return { httpCode: 507, body: { error: "insufficient_storage" } };
    }

    // Two rounds at most: a duplicate key on insert means another request
    // committed this sessionId in between, and the second step 3 sees it.
    for (let round = 0; ; round++) {
      const existing = await resolveExisting(fields, file, at);
      if (existing) return existing;
      let committed;
      try {
        committed = await commitSession(store, fields, file, at, limits);
      } catch (err) {
        if (err?.code === DUP_KEY && round === 0) continue;
        if (err instanceof QuarantineFull) {
          // Temporary from the device's point of view (503, it retries later):
          // once a master assigns or clears quarantine there is room again.
          await recordAttempt(executeQuery, {
            sessionId: fields.sessionId, installationId: fields.installationId, at, httpCode: 503,
            outcome: "quarantine_full", bytes: file.bytes, shaDeclared: fields.zipSha256, shaComputed: file.sha256,
          });
          return { httpCode: 503, body: { error: "quarantine_full" } };
        }
        throw err;
      }
      // Quarantined rows are validated too, so their checks are filled in for
      // the master who assigns the device.
      queue.enqueue(committed.id);
      if (committed.quarantined) {
        return { httpCode: 404, body: { error: "device_not_registered", quarantined: true } };
      }
      return {
        httpCode: 200,
        body: { status: "ok", sessionId: fields.sessionId, bytes: file.bytes, sha256: file.sha256, receivedAt: at.toISOString() },
      };
    }
  } catch (err) {
    await recordAttempt(executeQuery, {
      sessionId: fields.sessionId, installationId: fields.installationId, at, httpCode: 500,
      outcome: "error", bytes: file.bytes, shaDeclared: fields.zipSha256, shaComputed: file.sha256,
    }).catch(() => {});
    throw err;
  } finally {
    // A no-op after a successful commit (the temp name is gone by then).
    await store.discardTemp(file.tempPath).catch(() => {});
  }
}
