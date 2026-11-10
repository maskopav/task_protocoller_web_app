// src/routes/deviceLogsAdmin.js
//
// Admin device-log API (docs/device_logs/01_spec.md §5), mounted at /devices/logs.
// Master only: anyone else gets 404, as for quarantine. view and download also
// accept a download ticket, so they open in a new tab; the list needs a session.
import express from "express";
import { pipeline } from "stream";
import zlib from "zlib";
import { requireAuth, requireAuthOrTicket } from "../middleware/authMiddleware.js";
import { executeQuery } from "../db/queryHelper.js";
import { writeAudit } from "../upload/sessionAccess.js";
import { logToFile } from "../utils/logger.js";

const notFound = (res) => res.status(404).json({ error: "not_found" });
const masterOnly = (req, res, next) => (req.admin?.role === "master" ? next() : notFound(res));
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const iso = (v) => (v == null ? null : new Date(String(v).replace(" ", "T") + "Z").toISOString());

const logStreamError = (err) => {
  if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
    logToFile("ERROR", "Device log stream failed", { code: err.code ?? err.name ?? "Error" });
  }
};

// Audit must never break a download that is about to stream.
const auditSafe = (userId, action, logId) =>
  writeAudit(userId, action, null, { logId }).catch((err) =>
    logToFile("ERROR", "Audit write failed", { action, code: err?.code ?? err?.name ?? "Error" }));

export function createDeviceLogAdminRouter({ store }) {
  const router = express.Router();

  // GET /devices/logs?siteId=
  router.get("/", requireAuth, masterOnly, wrap(async (req, res) => {
    const siteId = Number(req.query.siteId);
    if (!Number.isInteger(siteId) || siteId < 1) return res.status(400).json({ error: "invalid_site" });
    const rows = await executeQuery(
      `SELECT l.id, l.device_id, d.label, d.installation_id, l.file_name, l.bytes, l.utc_offset, l.app_version, l.received_at
       FROM device_logs l JOIN devices d ON d.id = l.device_id
       WHERE l.site_id = ?
       ORDER BY l.received_at DESC, l.id DESC`,
      [siteId]
    );
    res.json({
      logs: rows.map((r) => ({
        id: r.id, deviceId: r.device_id, deviceLabel: r.label ?? null, installationId: r.installation_id,
        fileName: r.file_name, bytes: Number(r.bytes), utcOffset: r.utc_offset, appVersion: r.app_version,
        receivedAt: iso(r.received_at),
      })),
    });
  }));

  // The row and its key, or null for an unknown id or a missing file.
  const open = async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return null;
    const [row] = await executeQuery(`SELECT id, device_id, sha256, file_name FROM device_logs WHERE id = ?`, [id]);
    if (!row) return null;
    const key = store.deviceLogKey(Number(row.device_id), row.sha256);
    try { await store.stat(key); } catch { return null; }
    return { row, key };
  };

  // GET /devices/logs/:id/view — the decompressed text, streamed
  router.get("/:id/view", requireAuthOrTicket, masterOnly, wrap(async (req, res) => {
    const found = await open(req);
    if (!found) return notFound(res);
    await auditSafe(req.admin.id, "device_log_view", found.row.id);
    res.set("Content-Type", "text/plain; charset=utf-8");
    pipeline(store.openRead(found.key), zlib.createGunzip(), res, logStreamError);
  }));

  // GET /devices/logs/:id/download — the stored .gz
  router.get("/:id/download", requireAuthOrTicket, masterOnly, wrap(async (req, res) => {
    const found = await open(req);
    if (!found) return notFound(res);
    await auditSafe(req.admin.id, "device_log_download", found.row.id);
    res.set({
      "Content-Type": "application/gzip",
      // file_name passed the strict app.<date>.<n>.log.gz pattern on the way in.
      "Content-Disposition": `attachment; filename="${found.row.file_name}"`,
    });
    pipeline(store.openRead(found.key), res, logStreamError);
  }));

  return router;
}
