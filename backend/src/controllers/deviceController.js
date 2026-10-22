// src/controllers/deviceController.js
//
// Devices (spec §6): implicit registration, check-in, and the admin list.
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { getVisibleSiteIds, scopeWhereClause } from "../utils/accessScope.js";
import { logToFile } from "../utils/logger.js";

const INSTALLATION_ID = /^[A-Za-z0-9-]{1,64}$/;
const SILENT_MS = 7 * 24 * 3600e3;
const MAX_COUNT = 100000;

export const isValidInstallationId = (v) => typeof v === "string" && INSTALLATION_ID.test(v);

// Returns the version, or null when absent/invalid (callers ignore it).
export const cleanAppVersion = (v) =>
  typeof v === "string" && v.length >= 1 && v.length <= 32 && !/[\u0000-\u001f\u007f]/.test(v) ? v : null;

const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;

/**
 * Called by getSiteConfig after the token resolved. Never throws: a device
 * bookkeeping failure must not keep a clinic from getting its config.
 */
export async function registerDeviceFromConfig({ installationId, appVersion, siteId, configVersion }) {
  if (!isValidInstallationId(installationId)) return;
  try {
    await executeQuery(
      `INSERT INTO devices (installation_id, site_id, app_version, last_config_version, last_config_at, last_seen_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE site_id = VALUES(site_id),
         app_version = COALESCE(VALUES(app_version), app_version),
         last_config_version = VALUES(last_config_version),
         last_config_at = VALUES(last_config_at), last_seen_at = VALUES(last_seen_at)`,
      [installationId, siteId, cleanAppVersion(appVersion), configVersion == null ? null : String(configVersion).slice(0, 32)]
    );
  } catch (err) {
    logToFile("ERROR", "Device registration failed", { installationId, code: err?.code ?? err?.name ?? "Error" });
  }
}

// POST /device-checkin — public, gated by the site token.
export const deviceCheckin = async (req, res) => {
  const { siteToken, installationId, appVersion, pending, failed } = req.body ?? {};
  if (
    typeof siteToken !== "string" || siteToken.length === 0 || siteToken.length > 255 ||
    !isValidInstallationId(installationId) ||
    (appVersion != null && cleanAppVersion(appVersion) === null) ||
    !isCount(pending) || !isCount(failed)
  ) {
    return res.status(400).json({ error: "invalid_request" });
  }
  try {
    const sites = await executeQuery(
      `SELECT id FROM sites WHERE access_token = ? AND is_active = 1`,
      [siteToken]
    );
    if (sites.length === 0) return res.status(404).json({ error: "invalid_token" });

    await executeQuery(
      `INSERT INTO devices (installation_id, site_id, app_version, last_seen_at, local_pending, local_failed)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), ?, ?)
       ON DUPLICATE KEY UPDATE site_id = VALUES(site_id),
         app_version = COALESCE(VALUES(app_version), app_version),
         last_seen_at = VALUES(last_seen_at),
         local_pending = VALUES(local_pending), local_failed = VALUES(local_failed)`,
      [installationId, sites[0].id, appVersion ?? null, pending, failed]
    );
    res.json({ status: "ok" });
  } catch (err) {
    logToFile("ERROR", "Device check-in failed", { installationId, code: err?.code ?? err?.name ?? "Error" });
    res.status(500).json({ error: "internal" });
  }
};

/**
 * Mirrors deviceHealth() in the ui_design ui.js. `rank` orders the list.
 * A device with no last-seen time counts as silent once it has uploaded.
 */
export function deviceHealth(d, now = Date.now()) {
  if (d.neverUploaded) return { key: "off", label: "No uploads yet", rank: 2 };
  if (!d.lastUpload) return { key: "off", label: "No uploads in your scope", rank: 2 };
  const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : NaN;
  if (!Number.isFinite(seen) || now - seen > SILENT_MS) return { key: "bad", label: "Silent > 7 days", rank: 0 };
  if (d.failed > 0 || d.pending > 0) return { key: "warn", label: "Backlog", rank: 1 };
  return { key: "ok", label: "Healthy", rank: 3 };
}

// dateStrings:true gives "YYYY-MM-DD HH:MM:SS" in UTC; the API returns ISO.
const iso = (v) => {
  if (v == null) return null;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const emptyStats = () => ({ devices: 0, healthy: 0, waiting: 0, failed: 0, silent: 0 });

// GET /devices[?siteId=]
export const listDevices = async (req, res) => {
  try {
    const isMaster = req.admin?.role === "master";
    const where = [];
    const params = [];
    let grantedSites = new Set();

    if (!isMaster) {
      const visible = await getVisibleSiteIds(req.admin?.id ?? null);
      if (visible.length === 0) return res.json({ devices: [], stats: emptyStats() });
      where.push("d.site_id IN (?)");
      params.push(visible);
      // Check-in counts are per device, not per project: only a clinic grant sees them.
      const grants = await executeQuery(`SELECT site_id FROM user_sites WHERE user_id = ?`, [req.admin.id]);
      grantedSites = new Set(grants.map((g) => Number(g.site_id)));
    }
    if (req.query?.siteId != null && req.query.siteId !== "") {
      const siteId = Number(req.query.siteId);
      if (!Number.isInteger(siteId) || siteId < 1) return res.status(400).json({ error: "invalid_site" });
      where.push("d.site_id = ?");
      params.push(siteId);
    }

    const scope = scopeWhereClause(req.admin, "us");
    const rows = await executeQuery(
      `SELECT d.id, d.installation_id, d.label, d.site_id, s.name AS site_name, d.app_version,
              d.last_config_version, d.last_config_at, d.last_seen_at, d.local_pending, d.local_failed,
              (SELECT MAX(us.received_at) FROM upload_sessions us
                WHERE us.device_id = d.id AND ${scope.sql}) AS last_upload,
              (SELECT COUNT(*) FROM upload_sessions us
                WHERE us.device_id = d.id AND ${scope.sql}
                  AND us.received_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS uploads30,
              EXISTS (SELECT 1 FROM upload_sessions ua WHERE ua.device_id = d.id) AS has_uploads
       FROM devices d
       LEFT JOIN sites s ON s.id = d.site_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
      [...scope.params, ...scope.params, ...params]
    );

    const now = Date.now();
    const devices = rows.map((r) => {
      const backlogHidden = !isMaster && !grantedSites.has(Number(r.site_id));
      const base = {
        id: r.id,
        installationId: r.installation_id,
        label: r.label ?? null,
        siteId: r.site_id ?? null,
        siteName: r.site_name ?? null,
        appVersion: r.app_version ?? null,
        lastConfigVersion: r.last_config_version ?? null,
        lastConfigAt: iso(r.last_config_at),
        lastSeenAt: iso(r.last_seen_at),
        pending: backlogHidden ? 0 : Number(r.local_pending) || 0,
        failed: backlogHidden ? 0 : Number(r.local_failed) || 0,
        backlogHidden,
        lastUpload: iso(r.last_upload),
        uploads30: Number(r.uploads30) || 0,
        neverUploaded: Number(r.has_uploads) === 0,
      };
      const { rank, ...health } = deviceHealth(base, now);
      return { ...base, health, rank };
    });

    devices.sort((a, b) =>
      a.rank - b.rank ||
      (a.label ?? a.installationId).localeCompare(b.label ?? b.installationId));

    const stats = emptyStats();
    stats.devices = devices.length;
    for (const d of devices) {
      if (d.health.key === "ok") stats.healthy++;
      if (d.health.key === "bad") stats.silent++;
      if (!d.backlogHidden) { stats.waiting += d.pending; stats.failed += d.failed; }
      delete d.rank;
    }
    res.json({ devices, stats });
  } catch (err) {
    logToFile("ERROR", "Failed to list devices", { error: err.message });
    res.status(500).json({ error: "internal" });
  }
};

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const masterOnly = (req, res) => {
  if (req.admin?.role === "master") return true;
  res.status(403).json({ error: "forbidden" });
  return false;
};

// PUT /devices/:id {label} — master only
export const renameDevice = async (req, res) => {
  if (!masterOnly(req, res)) return;
  const id = parseId(req.params.id);
  const raw = req.body?.label;
  if (raw != null && typeof raw !== "string") return res.status(400).json({ error: "invalid_label" });
  const label = raw == null || raw.trim() === "" ? null : raw.trim();
  if (label !== null && label.length > 255) return res.status(400).json({ error: "invalid_label" });
  try {
    const rows = id ? await executeQuery(`SELECT id FROM devices WHERE id = ?`, [id]) : [];
    if (rows.length === 0) return res.status(404).json({ error: "not_found" });
    await executeQuery(`UPDATE devices SET label = ? WHERE id = ?`, [label, id]);
    res.json({ id, label });
  } catch (err) {
    logToFile("ERROR", "Failed to rename device", { deviceId: id, error: err.message });
    res.status(500).json({ error: "internal" });
  }
};

// PUT /devices/:id/site {siteId} — master only. Releases the device's
// quarantined sessions into validation under the new site.
export const makeAssignDeviceSite = (queue) => async (req, res) => {
  if (!masterOnly(req, res)) return;
  const id = parseId(req.params.id);
  const rawSite = req.body?.siteId;
  const siteId = typeof rawSite === "number" || typeof rawSite === "string" ? parseId(rawSite) : null;
  if (siteId === null) return res.status(400).json({ error: "invalid_site" });
  try {
    const moved = await executeTransaction(async (conn) => {
      const q = async (sql, p) => (await conn.query(sql, p))[0];
      if (!id || (await q(`SELECT id FROM devices WHERE id = ?`, [id])).length === 0) return null;
      if ((await q(`SELECT id FROM sites WHERE id = ?`, [siteId])).length === 0) return "no_site";
      await q(`UPDATE devices SET site_id = ? WHERE id = ?`, [siteId, id]);
      const pending = await q(`SELECT id FROM upload_sessions WHERE device_id = ? AND site_id IS NULL`, [id]);
      if (pending.length > 0) {
        await q(
          `UPDATE upload_sessions SET site_id = ?, status = 'validating', invalid_reason = NULL
           WHERE device_id = ? AND site_id IS NULL`,
          [siteId, id]
        );
      }
      return pending.map((r) => r.id);
    });
    if (moved === null) return res.status(404).json({ error: "not_found" });
    if (moved === "no_site") return res.status(404).json({ error: "site_not_found" });
    // After commit, so the worker sees the rows it is asked to validate.
    for (const sid of moved) queue.enqueue(sid);
    res.json({ moved: moved.length });
  } catch (err) {
    logToFile("ERROR", "Failed to assign device site", { deviceId: id, error: err.message });
    res.status(500).json({ error: "internal" });
  }
};
