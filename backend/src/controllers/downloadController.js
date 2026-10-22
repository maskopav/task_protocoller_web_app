// src/controllers/downloadController.js
//
// Downloads (spec §9): the stored session ZIP, clips for playback, and
// multi-session bundles. Everything streams; nothing is buffered. All of it
// needs the edit right. Out-of-scope and nonexistent are both 404.
import { pipeline } from "stream";
import { ZipArchive } from "archiver";
import { executeQuery } from "../db/queryHelper.js";
import { findScopedSession, writeAudit, SESSION_ID } from "../upload/sessionAccess.js";
import { openZip } from "../upload/zipReader.js";
import { toCsv } from "../upload/csv.js";
import { logToFile } from "../utils/logger.js";

export const MAX_BUNDLE_SESSIONS = 200;
export const MAX_BUNDLE_BYTES = 5 * 1024 ** 3;

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};

const iso = (d) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));

const sidecar = (row) =>
  JSON.stringify({ fields: parseJson(row.participant_fields) ?? {}, editedAt: iso(row.participant_edited_at) }, null, 2);

// Audit must never break a download that is already streaming.
const auditSafe = (userId, action, id, details) =>
  writeAudit(userId, action, id, details).catch((err) =>
    logToFile("ERROR", "Audit write failed", { action, code: err?.code ?? err?.name ?? "Error" }));

const newArchive = () => new ZipArchive({ store: true, zip64: true });

const logStreamError = (err) => {
  if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
    logToFile("ERROR", "Download stream failed", { code: err.code ?? err.name ?? "Error" });
  }
};

// Pipes an archive to res; an abort stops the archive and releases its files.
function sendArchive(res, archive, onFirstData) {
  pipeline(archive, res, logStreamError);
  archive.once("data", onFirstData);
  // archiver reports a missing or unreadable source file as a *warning* and
  // carries on, which would end in a 200 bundle that silently lacks a session
  // its sessions.csv lists. Any warning aborts the response instead, so the
  // browser shows a failed download.
  archive.on("warning", (err) => {
    logStreamError(err);
    archive.abort();
    res.destroy(err);
  });
  res.on("close", () => { if (!res.writableFinished) archive.abort(); });
  Promise.resolve(archive.finalize()).catch(logStreamError);
}

const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);

export function createDownloadHandlers({ store }) {
  const download = async (req, res) => {
    const row = await findScopedSession(req.admin, req.params.sessionId);
    if (!row) return res.status(404).json({ error: "not_found" });
    if (!row.can_edit) return res.status(403).json({ error: "forbidden" });
    if (row.status === "validating") return res.status(409).json({ error: "validating" });

    const id = row.session_id;
    let size;
    try { size = (await store.stat(row.storage_path)).size; }
    catch { return res.status(404).json({ error: "not_found" }); }
    const audit = () => auditSafe(req.admin.id, "download", row.id, { sessionId: id });

    res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${id}.zip"` });
    if (row.participant_edited_at) {
      const archive = newArchive();
      archive.file(store.resolve(row.storage_path), { name: `${id}.zip` });
      archive.append(sidecar(row), { name: `${id}.participant.json` });
      return sendArchive(res, archive, audit);
    }

    res.set("Content-Length", String(size));
    const src = store.openRead(row.storage_path);
    pipeline(src, res, logStreamError);
    src.once("data", audit);
  };

  const clip = async (req, res) => {
    const row = await findScopedSession(req.admin, req.params.sessionId);
    if (!row) return res.status(404).json({ error: "not_found" });
    if (!row.can_edit) return res.status(403).json({ error: "forbidden" });

    const raw = req.params.path;
    // The URL is /uploads/:id/clips/<file>: the route already consumed the
    // "clips/" of the entry path (UD §2: every clip lives under clips/).
    const rest = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    const name = rest === "" ? "" : `clips/${rest}`;
    const tasks = parseJson(row.exam_summary)?.tasks;
    const listed = name !== "" && Array.isArray(tasks) && tasks.some((t) => t && (t.clipFile === name || t.videoFile === name));
    if (!listed) return res.status(404).json({ error: "not_found" });
    if (row.status === "validating") return res.status(409).json({ error: "validating" });

    let zip;
    try {
      zip = await openZip(store.resolve(row.storage_path));
      const entry = zip.entries.find((e) => e.name === name && !e.isDirectory);
      if (!entry) { zip.close(); return res.status(404).json({ error: "not_found" }); }

      const size = entry.uncompressedSize;
      const unsatisfiable = () => {
        zip.close();
        return res.status(416).set("Content-Range", `bytes */${size}`).end();
      };
      let start = 0, end = size - 1, status = 200;
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? "").trim());
      if (m && (m[1] !== "" || m[2] !== "")) {
        if (m[1] === "") { // suffix: the last n bytes
          const n = Number(m[2]);
          if (n === 0 || size === 0) return unsatisfiable();
          start = Math.max(size - n, 0);
        } else {
          start = Number(m[1]);
          if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
          if (start >= size || start > end) return unsatisfiable();
        }
        status = 206;
      }

      const opened = zip;
      res.on("close", () => opened.close());
      const stream = await zip.openEntry(name, status === 206 ? { start, end } : undefined);
      res.status(status).set({
        "Content-Type": name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "audio/wav",
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      pipeline(stream, res, logStreamError);
    } catch (err) {
      zip?.close();
      logToFile("ERROR", "Clip stream failed", { code: err?.code ?? err?.name ?? "Error" });
      if (!res.headersSent) res.status(500).json({ error: "server_error" });
      else res.destroy();
    }
  };

  const bundle = async (req, res) => {
    const ids = req.body?.sessionIds;
    if (
      !Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BUNDLE_SESSIONS ||
      !ids.every((i) => typeof i === "string" && SESSION_ID.test(i)) || new Set(ids).size !== ids.length
    ) return res.status(400).json({ error: "invalid_request" });

    const rows = [];
    for (const id of ids) {
      const row = await findScopedSession(req.admin, id);
      if (!row) return res.status(404).json({ error: "not_found" });
      rows.push(row);
    }
    // Same rule as the single download: visible but read-only is 403.
    if (rows.some((r) => !r.can_edit)) return res.status(403).json({ error: "forbidden" });
    if (rows.some((r) => r.status === "validating")) return res.status(409).json({ error: "validating" });
    if (rows.reduce((sum, r) => sum + Number(r.bytes), 0) > MAX_BUNDLE_BYTES) {
      return res.status(413).json({ error: "too_large" });
    }

    // Every file must exist before the first byte goes out: once streaming has
    // started the only way to signal a problem is a broken download.
    for (const r of rows) {
      try {
        await store.stat(r.storage_path);
      } catch {
        logToFile("ERROR", "Bundle: stored session file missing", { sessionId: r.session_id });
        return res.status(500).json({ error: "file_missing" });
      }
    }

    const names = await executeQuery(
      `SELECT us.session_id, p.name AS protocol, pr.name AS project
       FROM upload_sessions us
       LEFT JOIN protocols p ON p.id = us.protocol_id
       LEFT JOIN projects pr ON pr.id = us.project_id
       WHERE us.session_id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    const byId = new Map(names.map((n) => [n.session_id, n]));

    const csv = toCsv(
      ["sessionId", "patient_code", "visit_number", "protocol", "project", "site", "recordedAt", "receivedAt", "status", "qc", "flags"],
      rows.map((r) => {
        const n = byId.get(r.session_id) ?? {};
        const flags = parseJson(r.flags);
        return [
          r.session_id, r.patient_code, r.visit_number,
          n.protocol ?? r.protocol_name, n.project ?? r.protocol_project, r.site_name,
          // recordedAt = the session end, as in the list CSV (processedAt when the
          // app never wrote endedAt).
          iso(r.ended_at ?? r.processed_at), iso(r.received_at), r.status, r.qc,
          Array.isArray(flags) ? flags.join(";") : "",
        ];
      })
    );

    const archive = newArchive();
    for (const r of rows) {
      archive.file(store.resolve(r.storage_path), { name: `${r.session_id}.zip` });
      if (r.participant_edited_at) archive.append(sidecar(r), { name: `${r.session_id}.participant.json` });
    }
    archive.append(csv, { name: "sessions.csv" });

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="uploads-${utcStamp()}.zip"`,
    });
    sendArchive(res, archive, () => auditSafe(req.admin.id, "bundle", null, { sessionIds: ids }));
  };

  return { download, clip, bundle };
}
