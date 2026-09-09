// backend/src/controllers/sessionDataController.js
// HTTP glue for the admin "download session data" feature: parses query
// params, delegates DB access to sessionDataService and zip streaming to
// sessionArchiveBuilder. Mounted master-only in server.js -- recordings and
// task payloads are clinical/participant data, same sensitivity class as
// the system log viewer.
import { findSessionsForExport, getSessionExportBundle } from "../services/sessionDataService.js";
import { streamSessionArchive, sessionArchiveFilename } from "../services/sessionArchiveBuilder.js";
import { logToFile } from "../utils/logger.js";
import { MAX_EXPORT_SESSIONS } from "../config/constants.js";

// The frontend sends since/until as ISO 8601 (e.g.
// "2026-09-03T10:00:00.000Z") -- MariaDB's implicit string->DATETIME cast
// doesn't reliably accept the "T"/"Z"/milliseconds, so normalize to
// "YYYY-MM-DD HH:MM:SS" (still UTC, matching how session_date is written
// via UTC_TIMESTAMP()) before it ever reaches a query.
function toMysqlDateTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function parseFilters(query) {
  const { projectId, protocolId, since, until } = query;
  return {
    projectId: projectId ? Number(projectId) : null,
    protocolId: protocolId ? Number(protocolId) : null,
    since: since ? toMysqlDateTime(since) : null,
    until: until ? toMysqlDateTime(until) : null,
  };
}

function parseSessionIds(raw) {
  return String(raw || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

// GET /session-data/sessions?projectId=&protocolId=&since=&until=
// Lists sessions matching the filters so the admin can review/select before
// downloading. `truncated` tells the frontend more rows exist than shown.
export const listSessions = async (req, res) => {
  try {
    const filters = parseFilters(req.query);
    const rows = await findSessionsForExport({ ...filters, limit: MAX_EXPORT_SESSIONS + 1 });
    const truncated = rows.length > MAX_EXPORT_SESSIONS;

    res.json({
      sessions: truncated ? rows.slice(0, MAX_EXPORT_SESSIONS) : rows,
      truncated,
      maxSessions: MAX_EXPORT_SESSIONS,
    });
  } catch (err) {
    logToFile("ERROR", "Failed to list sessions for export", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to load sessions" });
  }
};

// GET /session-data/download?sessionIds=1,2,3
// GET /session-data/download?projectId=&protocolId=&since=&until=
// Either an explicit session id list, or the same filters as /sessions to
// download everything currently matching them (capped at MAX_EXPORT_SESSIONS
// -- past that the admin must narrow the filter or select sessions
// explicitly in smaller batches).
export const downloadSessions = async (req, res) => {
  try {
    const explicitIds = parseSessionIds(req.query.sessionIds);
    let sessionIds = explicitIds;

    if (sessionIds.length === 0) {
      const filters = parseFilters(req.query);
      const rows = await findSessionsForExport({ ...filters, limit: MAX_EXPORT_SESSIONS + 1 });
      if (rows.length > MAX_EXPORT_SESSIONS) {
        return res.status(400).json({
          error: `Too many sessions match these filters (over ${MAX_EXPORT_SESSIONS}). Narrow the date range/protocol, or select specific sessions instead.`,
        });
      }
      sessionIds = rows.map((r) => r.session_id);
    } else if (sessionIds.length > MAX_EXPORT_SESSIONS) {
      return res.status(400).json({ error: `Too many sessions selected (max ${MAX_EXPORT_SESSIONS}).` });
    }

    if (sessionIds.length === 0) {
      return res.status(404).json({ error: "No sessions match these filters" });
    }

    const bundle = await getSessionExportBundle(sessionIds);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${sessionArchiveFilename()}"`);

    await streamSessionArchive(bundle, res);

    logToFile("INFO", "Session data export downloaded", {
      admin: req.admin?.id,
      sessionCount: sessionIds.length,
    });
  } catch (err) {
    logToFile("ERROR", "Failed to build session data export", { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to build export" });
    } else {
      res.destroy(err);
    }
  }
};
