// src/controllers/uploadController.js — read/review API for uploaded sessions (spec §7, §8).
//
// Scope is applied in SQL (scopeWhereClause) for lists and aggregates, and per
// session through findScopedSession, so "out of scope" and "does not exist" are
// the same 404. Participant values never reach a log line or a list response.
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { scopeWhereClause, getVisibleSiteIds, getVisibleProjectIds } from "../utils/accessScope.js";
import { findScopedSession, writeAudit } from "../upload/sessionAccess.js";
import { needsAttention } from "../upload/sessionExtractor.js";
import { logToFile } from "../utils/logger.js";
import { toIso } from "../utils/dateIso.js";
import { readQuestionTexts } from "../upload/questionTexts.js";
import { LocalFileStore } from "../storage/fileStore.js";

// --- Vocabulary (mirrors ui_design/assets/ui.js) --------------------------------

export const STATUSES = ["validating", "valid", "invalid"];
export const QCS = ["unreviewed", "ok", "review", "excluded"];
export const QC_LABEL = { unreviewed: "Unreviewed", ok: "OK", review: "Needs review", excluded: "Excluded" };
export const FLAG_KEYS = [
  "recovered", "interrupted", "skipped", "retakes", "edited", "outdated",
  "late", "duplicate", "nonstdMic", "nonstdCam", "device",
];
// Same set as ATTENTION_FLAGS in sessionExtractor (needsAttention), as SQL.
const ATTENTION_FLAG_KEYS = ["recovered", "interrupted", "nonstdMic", "nonstdCam"];
const ATTENTION_SQL = `(us.status = 'invalid' OR us.qc = 'review' OR ${
  ATTENTION_FLAG_KEYS.map((k) => `JSON_CONTAINS(us.flags, '"${k}"')`).join(" OR ")})`;

export const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const EXPORT_MAX_ROWS = 100000;
const MASK_EXEMPT = new Set(["patient_code", "visit_number"]);
const REQUIRED_FIELDS = new Set(["patient_code", "visit_number"]);
const FIELD_MAX = 255;
const COMMENT_MAX = 2000;

// Sort keys → SQL expression. This map is the only place a client-chosen word
// becomes SQL text. status and qc use the semantic order from the UI.
const RECORDED = "COALESCE(us.ended_at, us.processed_at)";
const SORTS = {
  receivedAt: "us.received_at",
  site: "s.name",
  patient: "us.patient_code",
  protocol: "us.protocol_name",
  endedAt: RECORDED,
  durationS: "us.duration_s",
  bytes: "us.bytes",
  status: "FIELD(us.status, 'invalid', 'validating', 'valid')",
  qc: "FIELD(us.qc, 'review', 'unreviewed', 'ok', 'excluded')",
};

// --- Small helpers ----------------------------------------------------------------

const parseJson = (raw, fallback) => {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
};

export { toIso };

const toDay = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const num = (v) => (v == null ? 0 : Number(v));

class QueryError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const one = (v, name) => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new QueryError(`invalid_${name}`);
  return v;
};

const list = (v, name) => {
  if (v == null) return [];
  const items = Array.isArray(v) ? v : [v];
  return items.flatMap((x) => {
    if (typeof x !== "string") throw new QueryError(`invalid_${name}`);
    return x.split(",").map((p) => p.trim()).filter(Boolean);
  });
};

const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// --- Filters (pure) ----------------------------------------------------------------

/** Validates the list query string. Throws QueryError (→ 400) on anything unknown. */
export function parseListQuery(query = {}) {
  const f = {};
  f.q = (one(query.q, "q") ?? "").trim().slice(0, 100);

  f.sites = list(query.site, "site").map((x) => {
    if (!/^\d{1,10}$/.test(x)) throw new QueryError("invalid_site");
    return Number(x);
  });

  f.project = one(query.project, "project");
  f.protocol = one(query.protocol, "protocol");

  f.dateField = one(query.dateField, "dateField") ?? "received";
  if (!["received", "recorded"].includes(f.dateField)) throw new QueryError("invalid_dateField");
  f.from = one(query.from, "from");
  f.to = one(query.to, "to");
  if ((f.from && !isDay(f.from)) || (f.to && !isDay(f.to))) throw new QueryError("invalid_date");

  f.status = one(query.status, "status");
  if (f.status && !STATUSES.includes(f.status)) throw new QueryError("invalid_status");
  f.qc = one(query.qc, "qc");
  if (f.qc && !QCS.includes(f.qc)) throw new QueryError("invalid_qc");

  f.flags = [...new Set(list(query.flag, "flag"))];
  if (f.flags.some((k) => !FLAG_KEYS.includes(k))) throw new QueryError("invalid_flag");

  f.hasVideo = ["1", "true"].includes(one(query.hasVideo, "hasVideo"));
  f.attention = ["1", "true"].includes(one(query.attention, "attention"));

  const sort = one(query.sort, "sort") ?? "receivedAt";
  if (!Object.hasOwn(SORTS, sort)) throw new QueryError("invalid_sort");
  f.sort = sort;
  const dir = (one(query.dir, "dir") ?? "desc").toLowerCase();
  if (dir !== "asc" && dir !== "desc") throw new QueryError("invalid_dir");
  f.dir = dir;

  const page = Number.parseInt(one(query.page, "page") ?? "1", 10);
  f.page = Number.isFinite(page) && page >= 1 ? Math.min(page, 1e6) : 1;
  const per = Number.parseInt(one(query.pageSize, "pageSize") ?? "", 10);
  f.pageSize = PAGE_SIZES.includes(per) ? per : DEFAULT_PAGE_SIZE;
  return f;
}

const JOINS = `FROM upload_sessions us
  JOIN devices d ON d.id = us.device_id
  LEFT JOIN sites s ON s.id = us.site_id
  LEFT JOIN projects p ON p.id = us.project_id`;

/**
 * WHERE conditions (scope first) and their params, in SQL order. `omit` drops
 * filters that a facet/KPI must not apply to itself ('site', 'flag', 'status',
 * 'qc', 'attention').
 */
export function buildWhere(admin, f, omit = []) {
  const skip = new Set(omit);
  const scope = scopeWhereClause(admin, "us");
  const conds = [scope.sql];
  const params = [...scope.params];
  const add = (sql, ...p) => { conds.push(sql); params.push(...p); };

  if (f.q) {
    const esc = likeEscape(f.q);
    add(`(us.patient_code LIKE ? OR us.session_id LIKE ? OR d.installation_id LIKE ? OR d.label LIKE ?)`,
      `${esc}%`, `${esc}%`, `${esc}%`, `%${esc}%`);
  }
  if (!skip.has("site") && f.sites.length) add(`us.site_id IN (?)`, f.sites);
  if (f.project) {
    if (/^\d{1,10}$/.test(f.project)) add(`us.project_id = ?`, Number(f.project));
    else add(`COALESCE(p.name, us.protocol_project) = ?`, f.project);
  }
  if (f.protocol) add(`us.protocol_name = ?`, f.protocol);

  const col = f.dateField === "recorded" ? RECORDED : "us.received_at";
  if (f.from) add(`${col} >= ?`, `${f.from} 00:00:00`);
  if (f.to) add(`${col} < DATE_ADD(?, INTERVAL 1 DAY)`, f.to);

  if (!skip.has("status") && f.status) add(`us.status = ?`, f.status);
  if (!skip.has("qc") && f.qc) add(`us.qc = ?`, f.qc);
  if (!skip.has("flag")) for (const k of f.flags) add(`JSON_CONTAINS(us.flags, JSON_QUOTE(?))`, k);
  if (f.hasVideo) add(`us.video_clips > 0`);
  if (!skip.has("attention") && f.attention) add(ATTENTION_SQL);
  return { where: conds.join(" AND "), params };
}

const orderBy = (f) => `${SORTS[f.sort]} ${f.dir === "asc" ? "ASC" : "DESC"}, us.id DESC`;

/**
 * The list query as plain data, so an integration test can run it on its own
 * connection. `sql` selects one page, `countSql` the filtered total.
 * @returns {{sql: string, params: any[], countSql: string, countParams: any[], filters: object}}
 */
export function buildListQuery(admin, query = {}, { all = false } = {}) {
  const f = parseListQuery(query);
  const { where, params } = buildWhere(admin, f);
  const edit = scopeWhereClause(admin, "us", { editable: true });
  const limit = all ? `LIMIT ${EXPORT_MAX_ROWS}` : `LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`;
  const sql = `SELECT us.id AS pk, us.session_id, us.site_id, s.name AS site_name,
      d.installation_id, d.label AS device_label,
      us.protocol_name, us.project_id, COALESCE(p.name, us.protocol_project) AS project_name,
      us.started_at, us.ended_at, us.processed_at, us.received_at,
      us.duration_s, us.bytes, us.status, us.invalid_reason, us.qc, us.flags,
      us.tasks_total, us.tasks_done, us.tasks_skipped, us.audio_clips, us.video_clips, us.has_audio,
      us.patient_code, us.visit_number,
      (${edit.sql}) AS can_edit,
      (SELECT COUNT(*) FROM session_comments c WHERE c.upload_session_id = us.id AND c.is_system = 0) AS comment_count
    ${JOINS}
    WHERE ${where}
    ORDER BY ${orderBy(f)}
    ${limit}`;
  return {
    sql,
    params: [...edit.params, ...params],
    countSql: `SELECT COUNT(*) AS total ${JOINS} WHERE ${where}`,
    countParams: params,
    filters: f,
  };
}

// --- Row shapes --------------------------------------------------------------------

/** The list row, shaped after the mock session object (no participant fields beyond code and visit). */
export function listRow(r) {
  const issues = parseJson(r.flags, []);
  return {
    id: r.session_id,
    siteId: r.site_id,
    site: r.site_name ?? null,
    deviceId: r.installation_id,
    deviceLabel: r.device_label ?? null,
    protocol: r.protocol_name ?? null,
    projectId: r.project_id ?? null,
    project: r.project_name ?? null,
    startedAt: toIso(r.started_at),
    endedAt: toIso(r.ended_at),
    processedAt: toIso(r.processed_at),
    receivedAt: toIso(r.received_at),
    durationS: r.duration_s ?? null,
    bytes: num(r.bytes),
    status: r.status,
    invalidReason: r.invalid_reason ?? null,
    qc: r.qc,
    issues,
    needsAttention: needsAttention({ status: r.status, qc: r.qc, flags: issues }),
    tasksTotal: num(r.tasks_total),
    tasksDone: num(r.tasks_done),
    tasksSkipped: num(r.tasks_skipped),
    hasAudio: !!Number(r.has_audio),
    audioClips: num(r.audio_clips),
    videoClips: num(r.video_clips),
    participant: { patient_code: r.patient_code ?? null, visit_number: r.visit_number ?? null },
    canEdit: Number(r.can_edit) === 1,
    commentCount: num(r.comment_count),
  };
}

/** Every key null except patient_code and visit_number. */
export function maskParticipant(fields) {
  const src = fields && typeof fields === "object" ? fields : {};
  const out = {};
  const maskedKeys = [];
  for (const [k, v] of Object.entries(src)) {
    if (MASK_EXEMPT.has(k)) out[k] = v;
    else { out[k] = null; maskedKeys.push(k); }
  }
  return { fields: out, maskedKeys };
}

const initialsOf = (fullName, email) => {
  const words = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return String(email ?? "?").slice(0, 2).toUpperCase();
};

const commentRow = (r) => ({
  id: r.id,
  who: r.user_id == null ? "SYS" : initialsOf(r.full_name, r.email),
  name: r.user_id == null ? "System" : (r.full_name || String(r.email ?? "").split("@")[0]),
  at: toIso(r.created_at),
  text: r.text,
  system: !!Number(r.is_system),
});

const COMMENT_SELECT = `SELECT c.id, c.user_id, c.text, c.is_system, c.created_at, u.full_name, u.email
  FROM session_comments c LEFT JOIN users u ON u.id = c.user_id`;

const loadComments = async (pk) =>
  (await executeQuery(`${COMMENT_SELECT} WHERE c.upload_session_id = ? ORDER BY c.created_at, c.id`, [pk])).map(commentRow);

// --- Responses ---------------------------------------------------------------------

const fail = (res, err, what) => {
  if (err instanceof QueryError) return res.status(400).json({ error: err.code });
  // Codes only: DB error messages can quote the offending value (participant data).
  logToFile("ERROR", `uploads ${what} failed`, { code: err?.code ?? err?.name ?? "Error" });
  return res.status(500).json({ error: "internal" });
};

// Out of scope is 404 (never confirms existence). A visible but read-only
// session answers 403, because the UI shows view-only state for those anyway.
async function loadForEdit(req, res) {
  const row = await findScopedSession(req.admin, req.params.sessionId);
  if (!row) { res.status(404).json({ error: "not_found" }); return null; }
  if (!row.can_edit) { res.status(403).json({ error: "forbidden" }); return null; }
  return row;
}

// --- GET /uploads ------------------------------------------------------------------

async function aggregates(admin, f) {
  const kpiWhere = buildWhere(admin, f, ["status", "qc", "attention"]);
  const siteWhere = buildWhere(admin, f, ["site"]);
  const flagWhere = buildWhere(admin, f, ["flag"]);
  const flagCols = FLAG_KEYS.map((k, i) => `COALESCE(SUM(JSON_CONTAINS(us.flags, '"${k}"')), 0) AS f${i}`).join(", ");

  const [kpiRows, siteRows, flagRows] = await Promise.all([
    executeQuery(
      `SELECT COALESCE(SUM(us.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)), 0) AS received7d,
              COALESCE(SUM(us.status = 'valid'), 0) AS valid,
              COALESCE(SUM(us.status = 'invalid'), 0) AS invalid,
              COALESCE(SUM(${ATTENTION_SQL}), 0) AS attention,
              COALESCE(SUM(us.qc = 'unreviewed'), 0) AS unreviewed
       ${JOINS} WHERE ${kpiWhere.where}`, kpiWhere.params),
    executeQuery(
      `SELECT us.site_id AS id, s.name, COUNT(*) AS count ${JOINS}
       WHERE ${siteWhere.where} AND us.site_id IS NOT NULL
       GROUP BY us.site_id, s.name ORDER BY s.name`, siteWhere.params),
    executeQuery(
      `SELECT ${flagCols}, COALESCE(SUM(us.video_clips > 0), 0) AS video
       ${JOINS} WHERE ${flagWhere.where}`, flagWhere.params),
  ]);
  const k = kpiRows[0] ?? {};
  const fr = flagRows[0] ?? {};
  return {
    kpis: {
      received7d: num(k.received7d), valid: num(k.valid), invalid: num(k.invalid),
      attention: num(k.attention), unreviewed: num(k.unreviewed),
    },
    facets: {
      sites: siteRows.map((r) => ({ id: r.id, name: r.name, count: num(r.count) })),
      flags: FLAG_KEYS.map((key, i) => ({ key, count: num(fr[`f${i}`]) })),
      video: num(fr.video),
    },
  };
}

export const listUploads = async (req, res) => {
  try {
    const q = buildListQuery(req.admin, req.query);
    const [rows, totalRows, agg] = await Promise.all([
      executeQuery(q.sql, q.params),
      executeQuery(q.countSql, q.countParams),
      aggregates(req.admin, q.filters),
    ]);
    res.json({
      rows: rows.map(listRow),
      total: num(totalRows[0]?.total),
      page: q.filters.page,
      pageSize: q.filters.pageSize,
      ...agg,
    });
  } catch (err) {
    fail(res, err, "list");
  }
};

// --- GET /uploads/export.csv ------------------------------------------------------------

const CSV_COLUMNS = [
  ["sessionId", (r) => r.id],
  ["receivedAt", (r) => r.receivedAt],
  ["recordedAt", (r) => r.endedAt ?? r.processedAt],
  ["site", (r) => r.site],
  ["deviceId", (r) => r.deviceId],
  ["deviceLabel", (r) => r.deviceLabel],
  ["patientCode", (r) => r.participant.patient_code],
  ["visitNumber", (r) => r.participant.visit_number],
  ["protocol", (r) => r.protocol],
  ["project", (r) => r.project],
  ["durationS", (r) => r.durationS],
  ["tasksDone", (r) => r.tasksDone],
  ["tasksTotal", (r) => r.tasksTotal],
  ["tasksSkipped", (r) => r.tasksSkipped],
  ["audioClips", (r) => r.audioClips],
  ["videoClips", (r) => r.videoClips],
  ["bytes", (r) => r.bytes],
  ["status", (r) => r.status],
  ["invalidReason", (r) => r.invalidReason],
  ["qc", (r) => r.qc],
  ["flags", (r) => r.issues.join(";")],
  ["comments", (r) => r.commentCount],
];

/** One CSV field: formula-injection neutralised (strings only), quoted when needed. */
export function csvField(v) {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows) =>
  [CSV_COLUMNS.map(([h]) => h).join(","), ...rows.map((r) => CSV_COLUMNS.map(([, f]) => csvField(f(r))).join(","))]
    .join("\r\n") + "\r\n";

export const exportCsv = async (req, res) => {
  try {
    const q = buildListQuery(req.admin, req.query, { all: true });
    const rows = (await executeQuery(q.sql, q.params)).map(listRow);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uploads-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    res.send("﻿" + toCsv(rows));
  } catch (err) {
    fail(res, err, "export");
  }
};

// --- GET /uploads/summary -----------------------------------------------------------------

export const getSummary = async (req, res) => {
  try {
    const admin = req.admin;
    const id = (v, name) => {
      if (v == null || v === "") return null;
      if (typeof v !== "string" || !/^\d{1,10}$/.test(v)) throw new QueryError(`invalid_${name}`);
      return Number(v);
    };
    const siteId = id(req.query.siteId, "siteId");
    const projectId = id(req.query.projectId, "projectId");
    const d = Number.parseInt(one(req.query.days, "days") ?? "30", 10);
    const days = Number.isFinite(d) ? Math.min(90, Math.max(7, d)) : 30;

    // The same 404 for "not visible" and "does not exist".
    if (siteId != null) {
      const ok = admin.role === "master"
        ? (await executeQuery(`SELECT id FROM sites WHERE id = ?`, [siteId])).length > 0
        : (await getVisibleSiteIds(admin.id)).includes(siteId);
      if (!ok) return res.status(404).json({ error: "not_found" });
    }
    if (projectId != null) {
      const ok = admin.role === "master"
        ? (await executeQuery(`SELECT id FROM projects WHERE id = ?`, [projectId])).length > 0
        : (await getVisibleProjectIds(admin.id)).includes(projectId);
      if (!ok) return res.status(404).json({ error: "not_found" });
    }

    const scope = scopeWhereClause(admin, "us");
    const conds = [scope.sql];
    const params = [...scope.params];
    if (siteId != null) { conds.push("us.site_id = ?"); params.push(siteId); }
    if (projectId != null) { conds.push("us.project_id = ?"); params.push(projectId); }
    const where = conds.join(" AND ");
    const win = `us.received_at >= DATE_SUB(UTC_DATE(), INTERVAL ${days - 1} DAY)`;

    const [counts, series, byProtocol, bySite] = await Promise.all([
      executeQuery(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(us.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)), 0) AS week,
                COALESCE(SUM(us.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)), 0) AS last30,
                COALESCE(SUM(us.status = 'invalid'), 0) AS invalid,
                COALESCE(SUM(us.qc = 'review'), 0) AS needsReview,
                COALESCE(SUM(${ATTENTION_SQL}), 0) AS attention,
                COALESCE(SUM(us.qc = 'unreviewed'), 0) AS unreviewed,
                MAX(us.received_at) AS lastUpload
         FROM upload_sessions us WHERE ${where}`, params),
      executeQuery(
        `SELECT DATE(us.received_at) AS day, COUNT(*) AS count, COALESCE(SUM(us.status = 'invalid'), 0) AS invalid
         FROM upload_sessions us WHERE ${where} AND ${win} GROUP BY DATE(us.received_at)`, params),
      executeQuery(
        `SELECT us.protocol_name AS protocol, COUNT(*) AS count
         FROM upload_sessions us WHERE ${where} AND ${win}
         GROUP BY us.protocol_name ORDER BY count DESC, us.protocol_name`, params),
      executeQuery(
        `SELECT us.site_id AS id, s.name, COUNT(*) AS count
         FROM upload_sessions us LEFT JOIN sites s ON s.id = us.site_id
         WHERE ${where} AND ${win} AND us.site_id IS NOT NULL
         GROUP BY us.site_id, s.name ORDER BY count DESC, s.name`, params),
    ]);

    const byDay = new Map(series.map((r) => [toDay(r.day), r]));
    const today = new Date();
    const perDay = Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)))
        .toISOString().slice(0, 10);
      const r = byDay.get(date);
      return { date, count: num(r?.count), invalid: num(r?.invalid) };
    });

    const c = counts[0] ?? {};
    // Computers not yet assigned to a clinic (their recordings are quarantined).
    // Master only: nobody else sees unassigned computers.
    let unassignedDevices;
    if (admin.role === "master") {
      const [u] = await executeQuery(`SELECT COUNT(*) AS n FROM devices WHERE site_id IS NULL`, []);
      unassignedDevices = num(u?.n);
    }
    res.json({
      week: num(c.week), last30: num(c.last30), total: num(c.total),
      invalid: num(c.invalid), needsReview: num(c.needsReview),
      attention: num(c.attention), unreviewed: num(c.unreviewed),
      lastUpload: toIso(c.lastUpload),
      days,
      perDay,
      byProtocol: byProtocol.map((r) => ({ protocol: r.protocol ?? null, count: num(r.count) })),
      bySite: bySite.map((r) => ({ id: r.id, name: r.name, count: num(r.count) })),
      ...(unassignedDevices === undefined ? {} : { unassigned_devices: unassignedDevices }),
    });
  } catch (err) {
    fail(res, err, "summary");
  }
};

// --- GET /uploads/:sessionId ----------------------------------------------------------------

/** Neighbours of a session in the list the user came from (same filters and sort). */
async function neighbours(admin, sessionId, query) {
  let src = query;
  if (typeof query.ctx === "string") src = Object.fromEntries(new URLSearchParams(query.ctx));
  const f = parseListQuery(src);
  const { where, params } = buildWhere(admin, f);
  const rows = await executeQuery(
    `SELECT t.prev_id, t.next_id FROM (
       SELECT us.session_id,
              LAG(us.session_id) OVER (ORDER BY ${orderBy(f)}) AS prev_id,
              LEAD(us.session_id) OVER (ORDER BY ${orderBy(f)}) AS next_id
       ${JOINS} WHERE ${where}) t
     WHERE t.session_id = ?`,
    [...params, sessionId]
  );
  return { prevId: rows[0]?.prev_id ?? null, nextId: rows[0]?.next_id ?? null };
}

// Question/answer texts for the questionnaire answers, from the stored ZIP's
// config snapshot. Best effort: {} when there are no answers, no DATA_PATH or no readable ZIP.
async function loadQuestionTexts(row, exam) {
  const answerMaps = (exam.tasks ?? []).map((t) => t?.questionnaireAnswers).filter((a) => a && typeof a === "object");
  if (answerMaps.length === 0 || !row.storage_path || !process.env.DATA_PATH) return {};
  try {
    const file = new LocalFileStore(process.env.DATA_PATH).resolve(row.storage_path);
    return await readQuestionTexts(file, { protocolName: row.protocol_name, protocolProject: row.protocol_project, answerMaps });
  } catch {
    return {};
  }
}

export const getUpload = async (req, res) => {
  try {
    const row = await findScopedSession(req.admin, req.params.sessionId);
    if (!row) return res.status(404).json({ error: "not_found" });

    const [comments, nav, projectRows] = await Promise.all([
      loadComments(row.id),
      neighbours(req.admin, row.session_id, req.query).catch((err) => {
        if (err instanceof QueryError) return { prevId: null, nextId: null };
        throw err;
      }),
      row.project_id == null ? [] : executeQuery(`SELECT name FROM projects WHERE id = ?`, [row.project_id]),
    ]);

    const exam = parseJson(row.exam_summary, {}) ?? {};
    const issues = parseJson(row.flags, []);
    const questionTexts = await loadQuestionTexts(row, exam);
    const { fields, maskedKeys } = maskParticipant(parseJson(row.participant_fields, {}));
    res.json({
      id: row.session_id,
      siteId: row.site_id,
      site: row.site_name ?? null,
      deviceId: row.installation_id,
      deviceLabel: row.device_label ?? null,
      appVersion: row.app_version ?? null,
      protocol: row.protocol_name ?? null,
      projectId: row.project_id ?? null,
      project: projectRows[0]?.name ?? row.protocol_project ?? null,
      configVersion: row.config_version ?? null,
      startedAt: toIso(row.started_at),
      endedAt: toIso(row.ended_at),
      processedAt: toIso(row.processed_at),
      receivedAt: toIso(row.received_at),
      durationS: row.duration_s ?? null,
      bytes: num(row.bytes),
      zipSha256: row.zip_sha256,
      status: row.status,
      invalidReason: row.invalid_reason ?? null,
      qc: row.qc,
      issues,
      needsAttention: needsAttention({ status: row.status, qc: row.qc, flags: issues }),
      checks: parseJson(row.checks, []),
      tasksTotal: num(row.tasks_total),
      tasksDone: num(row.tasks_done),
      tasksSkipped: num(row.tasks_skipped),
      tasks: exam.tasks ?? [],
      audioClips: num(row.audio_clips),
      videoClips: num(row.video_clips),
      hasAudio: !!Number(row.has_audio),
      recovered: !!Number(row.recovered),
      interruptions: num(row.interruptions),
      interruptionEvents: exam.interruptions ?? [],
      timelineUsed: row.timeline_used ?? exam.timelineUsed ?? null,
      timeline: exam.timeline ?? null,
      captureFormat: exam.captureFormat ?? null,
      sampleRate: exam.sampleRate ?? null,
      hardware: exam.hardware ?? null,
      videoTakes: exam.videoTakes ?? [],
      questionTexts,
      participant: {
        patient_code: row.patient_code ?? null,
        visit_number: row.visit_number ?? null,
        fields,
        maskedKeys,
        editedAt: toIso(row.participant_edited_at),
      },
      comments,
      canEdit: row.can_edit,
      prevId: nav.prevId,
      nextId: nav.nextId,
    });
  } catch (err) {
    fail(res, err, "detail");
  }
};

// --- attempts, comments ----------------------------------------------------------------------

export const getAttempts = async (req, res) => {
  try {
    const row = await findScopedSession(req.admin, req.params.sessionId);
    if (!row) return res.status(404).json({ error: "not_found" });
    const rows = await executeQuery(
      `SELECT id, installation_id, at, http_code, outcome, bytes, sha_declared, sha_computed, device_reported
       FROM upload_attempts WHERE session_id = ? ORDER BY at DESC, id DESC`,
      [row.session_id]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      at: toIso(r.at),
      code: r.http_code,
      outcome: r.outcome,
      bytes: r.bytes == null ? null : Number(r.bytes),
      shaDeclared: r.sha_declared ?? null,
      shaComputed: r.sha_computed ?? null,
      deviceReported: !!Number(r.device_reported),
      installationId: r.installation_id ?? null,
    })));
  } catch (err) {
    fail(res, err, "attempts");
  }
};

export const getComments = async (req, res) => {
  try {
    const row = await findScopedSession(req.admin, req.params.sessionId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(await loadComments(row.id));
  } catch (err) {
    fail(res, err, "comments");
  }
};

export const addComment = async (req, res) => {
  try {
    const row = await loadForEdit(req, res);
    if (!row) return;
    const raw = req.body?.text;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text.length < 1 || text.length > COMMENT_MAX) return res.status(400).json({ error: "invalid_text" });
    const result = await executeQuery(
      `INSERT INTO session_comments (upload_session_id, user_id, text, is_system) VALUES (?, ?, ?, 0)`,
      [row.id, req.admin.id, text]
    );
    const created = await executeQuery(`${COMMENT_SELECT} WHERE c.id = ?`, [result.insertId]);
    res.status(201).json(commentRow(created[0] ?? { id: result.insertId, user_id: req.admin.id, text, is_system: 0, created_at: new Date() }));
  } catch (err) {
    fail(res, err, "comment");
  }
};

// --- GET /uploads/:sessionId/activity (F-044) -------------------------------------------------
// The audit entries of one session, scoped exactly like getUpload. Values of
// participant edits stay in the DB-only audit table: only the field names leave.

export function activityDetail(action, rawDetails) {
  const d = parseJson(rawDetails, null);
  if (!d || typeof d !== "object") return null;
  if (action === "participant_edit") {
    return { fields: Array.isArray(d.changes) ? d.changes.map((c) => c.field).filter(Boolean) : [] };
  }
  if (action === "qc_change") return { from: d.from ?? null, to: d.to ?? null };
  return null;
}

export const getActivity = async (req, res) => {
  try {
    const row = await findScopedSession(req.admin, req.params.sessionId);
    if (!row) return res.status(404).json({ error: "not_found" });
    const rows = await executeQuery(
      `SELECT a.id, a.action, a.details, a.created_at, a.user_id, u.full_name, u.email
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.upload_session_id = ?
       ORDER BY a.created_at DESC, a.id DESC`,
      [row.id]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      action: r.action,
      at: toIso(r.created_at),
      user: r.user_id == null ? null : { id: r.user_id, name: r.full_name ?? r.email ?? null },
      detail: activityDetail(r.action, r.details),
    })));
  } catch (err) {
    fail(res, err, "activity");
  }
};

// --- reveal / participant edit / qc ----------------------------------------------------------

export const revealParticipant = async (req, res) => {
  try {
    const row = await loadForEdit(req, res);
    if (!row) return;
    await writeAudit(req.admin.id, "reveal", row.id);
    res.json({ fields: parseJson(row.participant_fields, {}) ?? {} });
  } catch (err) {
    fail(res, err, "reveal");
  }
};

export const patchParticipant = async (req, res) => {
  try {
    const row = await loadForEdit(req, res);
    if (!row) return;
    const incoming = req.body?.fields;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming) || Object.keys(incoming).length === 0) {
      return res.status(400).json({ error: "invalid_fields" });
    }

    const outcome = await executeTransaction(async (conn) => {
      const q = async (sql, p) => (await conn.query(sql, p))[0];
      // Locked so two concurrent edits cannot record the same "old" value.
      const cur = await q(`SELECT participant_fields FROM upload_sessions WHERE id = ? FOR UPDATE`, [row.id]);
      const fields = parseJson(cur[0]?.participant_fields, null);
      if (!fields || typeof fields !== "object") return { error: "unknown_field" };

      const changes = [];
      for (const [k, v] of Object.entries(incoming)) {
        if (!Object.hasOwn(fields, k)) return { error: "unknown_field" };
        if (typeof v !== "string" || v.length > FIELD_MAX) return { error: "invalid_value" };
        if (REQUIRED_FIELDS.has(k) && v.trim() === "") return { error: "required_field" };
        if (k === "visit_number" && v.length > 64) return { error: "invalid_value" };
        if (v !== fields[k]) changes.push({ field: k, old: fields[k] ?? null, new: v });
      }
      if (changes.length === 0) return { changed: [], comment: null };

      const next = { ...fields };
      for (const c of changes) next[c.field] = c.new;
      await q(
        `UPDATE upload_sessions
         SET participant_fields = ?, patient_code = ?, visit_number = ?, participant_edited_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(next), next.patient_code ?? row.patient_code ?? null, next.visit_number ?? row.visit_number ?? null, row.id]
      );
      // Values stay in the DB-only audit table, the comment carries names only.
      await q(
        `INSERT INTO audit_log (user_id, action, upload_session_id, details) VALUES (?, 'participant_edit', ?, ?)`,
        [req.admin.id, row.id, JSON.stringify({ changes })]
      );
      const text = `edited participant fields: ${changes.map((c) => c.field).join(", ")}`;
      const ins = await q(
        `INSERT INTO session_comments (upload_session_id, user_id, text, is_system) VALUES (?, ?, ?, 1)`,
        [row.id, req.admin.id, text]
      );
      return { changed: changes.map((c) => c.field), commentId: ins?.insertId ?? null, text };
    });

    if (outcome.error) return res.status(400).json({ error: outcome.error });
    const after = await findScopedSession(req.admin, req.params.sessionId);
    res.json({
      changed: outcome.changed,
      participant: {
        ...maskParticipant(parseJson(after?.participant_fields, {})),
        patient_code: after?.patient_code ?? null,
        visit_number: after?.visit_number ?? null,
        editedAt: toIso(after?.participant_edited_at),
      },
      comments: await loadComments(row.id),
    });
  } catch (err) {
    fail(res, err, "participant edit");
  }
};

export const putQc = async (req, res) => {
  try {
    const row = await loadForEdit(req, res);
    if (!row) return;
    const qc = req.body?.qc;
    if (typeof qc !== "string" || !QCS.includes(qc)) return res.status(400).json({ error: "invalid_qc" });

    await executeTransaction(async (conn) => {
      const q = async (sql, p) => (await conn.query(sql, p))[0];
      await q(`UPDATE upload_sessions SET qc = ? WHERE id = ?`, [qc, row.id]);
      await q(
        `INSERT INTO session_comments (upload_session_id, user_id, text, is_system) VALUES (?, ?, ?, 1)`,
        [row.id, req.admin.id, `set review to ${QC_LABEL[qc]}`]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, upload_session_id, details) VALUES (?, 'qc_change', ?, ?)`,
        [req.admin.id, row.id, JSON.stringify({ from: row.qc, to: qc })]
      );
    });
    res.json({ qc, comments: await loadComments(row.id) });
  } catch (err) {
    fail(res, err, "qc");
  }
};
