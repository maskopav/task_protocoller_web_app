// src/upload/ingestService.js
// Rules: docs/upload_management/specification.md §3.2–3.3.
import { executeQuery, executeTransaction } from "../db/queryHelper.js";

const DUP_KEY = "ER_DUP_ENTRY";

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
    `SELECT id, session_id, bytes, zip_sha256, received_at FROM upload_sessions WHERE session_id = ?`,
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
    // The token is authoritative: a device that moved to another clinic's
    // token is reassigned (latest wins, as in GET /site-config).
    await q(
      `INSERT INTO devices (installation_id, site_id, app_version, last_seen_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE site_id = VALUES(site_id),
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
  // An invalid or inactive token quarantines even a known device: the spec
  // falls back to the device's site only when no token was sent.
  const siteId = site ? site.id : siteToken ? null : device.site_id ?? null;
  return { deviceId: device.id, siteId };
}

// Step 5. The row is inserted before the file is linked, so a concurrent
// request for the same sessionId fails on the unique key (and goes back to
// step 3) before it can reach the store. commit() refuses to overwrite anyway.
async function commitSession(store, fields, file, at) {
  return executeTransaction(async (conn) => {
    const { deviceId, siteId } = await resolveDevice(conn, fields, at);
    const quarantined = siteId === null;
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
    await store.commit(file.tempPath, key);
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
export async function ingestUpload(upload, { store, queue, now = () => new Date() }) {
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

    // Two rounds at most: a duplicate key on insert means another request
    // committed this sessionId in between, and the second step 3 sees it.
    for (let round = 0; ; round++) {
      const existing = await resolveExisting(fields, file, at);
      if (existing) return existing;
      let committed;
      try {
        committed = await commitSession(store, fields, file, at);
      } catch (err) {
        if (err?.code === DUP_KEY && round === 0) continue;
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
