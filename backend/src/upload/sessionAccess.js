// src/upload/sessionAccess.js
//
// Shared by the read/review API (uploadController) and the downloads
// (downloadController): load one session the caller may see, and write audit
// entries. Every admin endpoint that takes a sessionId goes through
// findScopedSession, so "out of scope" and "does not exist" are the same 404
// everywhere (spec §7.2).
import { executeQuery } from "../db/queryHelper.js";
import { scopeWhereClause } from "../utils/accessScope.js";

export const SESSION_ID = /^[0-9a-f]{32}$/;

/**
 * The upload_sessions row (all columns, plus site/device names and `can_edit`
 * as 0/1) if the caller can see it, else null. A malformed id is null too.
 *
 * @param {{id: number, role: string}} admin   req.admin
 * @param {string} sessionId                   32-hex public session id
 * @returns {Promise<object|null>}
 */
export async function findScopedSession(admin, sessionId) {
  if (!SESSION_ID.test(String(sessionId ?? ""))) return null;
  const see = scopeWhereClause(admin, "us");
  const edit = scopeWhereClause(admin, "us", { editable: true });
  const rows = await executeQuery(
    `SELECT us.*, (${edit.sql}) AS can_edit,
            s.name AS site_name, d.installation_id, d.label AS device_label
     FROM upload_sessions us
     JOIN devices d ON d.id = us.device_id
     LEFT JOIN sites s ON s.id = us.site_id
     WHERE us.session_id = ? AND ${see.sql}`,
    [...edit.params, sessionId, ...see.params]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], can_edit: Number(rows[0].can_edit) === 1 };
}

/**
 * @param {number|null} userId
 * @param {'reveal'|'download'|'bundle'|'participant_edit'|'qc_change'} action
 * @param {number|null} uploadSessionId   upload_sessions.id
 * @param {object} [details]              DB only, never mirrored to log files
 */
export async function writeAudit(userId, action, uploadSessionId, details = null) {
  await executeQuery(
    `INSERT INTO audit_log (user_id, action, upload_session_id, details) VALUES (?, ?, ?, ?)`,
    [userId ?? null, action, uploadSessionId ?? null, details == null ? null : JSON.stringify(details)]
  );
}
