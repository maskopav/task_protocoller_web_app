// src/upload/validationQueue.js
// Spec §4: serial and in-process. recover() re-enqueues rows left in 'validating'.
import { executeQuery } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";
import { validateArchive } from "./archiveValidator.js";
import { extractSession } from "./sessionExtractor.js";
import { loadSiteContext } from "./siteContext.js";

// The columns extractSession may set. The UPDATE is built from this list only,
// so a key the extractor adds later can never become an interpolated identifier.
const EXTRACTED = [
  "project_id", "protocol_id", "protocol_name", "protocol_project", "config_version",
  "started_at", "ended_at", "processed_at", "duration_s", "tasks_total", "tasks_done",
  "tasks_skipped", "audio_clips", "video_clips", "has_audio", "recovered", "interruptions",
  "timeline_used", "patient_code", "visit_number",
];
const EXTRACTED_JSON = ["participant_fields", "exam_summary"];
const REQUIRED_PARSED = ["manifest", "examination", "participant", "snapshot", "timelineOriginal"];

// Kept as they are once a master has edited the participant.
const PARTICIPANT_COLUMNS = new Set(["patient_code", "visit_number", "participant_fields"]);

const UNPROCESSABLE = { key: "archive", result: "bad", detail: "unprocessable content" };
const UNPROCESSABLE_CHECKS = [
  { key: "zip_checksum", result: "ok", detail: "verified at ingest" }, UNPROCESSABLE,
  ...["manifest", "ids", "device", "config_version", "complete"].map((key) => ({ key, result: "skip" })),
];

// Server-side errors about the data itself, as opposed to the connection or
// a lock, which a later retry can get past.
const RETRYABLE_DB = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT", "ER_CON_COUNT_ERROR",
  "ER_SERVER_SHUTDOWN", "ER_QUERY_INTERRUPTED"]);
const isDataRejection = (err) => typeof err?.code === "string" && err.code.startsWith("ER_")
  && !RETRYABLE_DB.has(err.code);

/**
 * Content that makes validation or extraction throw (or that the database
 * refuses) is malformed, not an I/O failure: the row is closed as invalid so
 * recover() does not retry it on every start. Extracted columns stay as they were.
 */
async function writeUnprocessable(row, checks) {
  const marked = checks.some((c) => c.key === "archive")
    ? checks.map((c) => (c.key === "archive" ? UNPROCESSABLE : c))
    : UNPROCESSABLE_CHECKS;
  await executeQuery(`UPDATE upload_sessions SET status = 'invalid', invalid_reason = 'malformed', checks = ? WHERE id = ?`,
    [JSON.stringify(marked), row.id]);
  logToFile("WARN", "Upload content unprocessable", { sessionId: row.session_id });
}

const parseFlags = (v) => {
  if (Array.isArray(v)) return v;
  try {
    const arr = JSON.parse(v ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/**
 * Validates one stored session and writes the outcome to its upload_sessions
 * row (status, invalid_reason, checks, and the extracted columns). Uses
 * validateArchive and extractSession.
 *
 * @param {number} uploadSessionId  upload_sessions.id
 * @param {{store: import('../storage/fileStore.js').LocalFileStore}} deps
 */
export async function validateStoredSession(uploadSessionId, { store }) {
  const [row] = await executeQuery(
    `SELECT us.id, us.session_id, us.site_id, us.storage_path, us.received_at, us.flags,
            us.participant_edited_at, d.installation_id
     FROM upload_sessions us JOIN devices d ON d.id = us.device_id WHERE us.id = ?`,
    [uploadSessionId]
  );
  if (!row) return;
  try {
    const site = await loadSiteContext(row.site_id ?? null);
    let result;
    try {
      result = await validateArchive(store.resolve(row.storage_path), {
        sessionId: row.session_id,
        installationId: row.installation_id,
        siteKnown: row.site_id != null,
        currentConfigVersion: site.currentConfigVersion,
      });
    } catch (err) {
      // Errno-coded errors are I/O on the stored file: the row stays
      // 'validating' and recover() retries it. Anything else is the content
      // tripping the validator, and retrying would fail forever.
      if (err?.code) throw err;
      await writeUnprocessable(row, UNPROCESSABLE_CHECKS);
      return;
    }

    const sets = ["status = ?", "invalid_reason = ?", "checks = ?"];
    const params = [result.status, result.invalidReason ?? null, JSON.stringify(result.checks)];

    // Extraction needs every required JSON file. A broken archive still gets
    // its status and checks, and keeps whatever columns it had.
    if (REQUIRED_PARSED.every((k) => result.parsed?.[k] != null)) {
      let columns;
      try {
        ({ columns } = extractSession(result.parsed, {
          receivedAt: new Date(`${String(row.received_at).replace(" ", "T")}Z`).toISOString(),
          currentConfigVersion: site.currentConfigVersion,
          projects: site.projects,
          existingFlags: parseFlags(row.flags),
        }));
      } catch {
        await writeUnprocessable(row, result.checks);
        return;
      }
      // A master's participant edit wins over the archive, also when the
      // session re-validates later (e.g. its quarantined device is assigned).
      const skip = row.participant_edited_at != null ? PARTICIPANT_COLUMNS : new Set();
      for (const col of EXTRACTED) {
        if (col in columns && !skip.has(col)) {
          sets.push(`${col} = ?`);
          params.push(columns[col] ?? null);
        }
      }
      for (const col of EXTRACTED_JSON) {
        if (col in columns && !skip.has(col)) {
          sets.push(`${col} = ?`);
          params.push(columns[col] == null ? null : JSON.stringify(columns[col]));
        }
      }
      if (Array.isArray(columns.flags)) {
        // A same-hash re-send can add 'duplicate' while this ran; keep it.
        const flags = JSON.stringify(columns.flags);
        sets.push(`flags = IF(JSON_CONTAINS(flags, '"duplicate"') AND NOT JSON_CONTAINS(?, '"duplicate"'),
                              JSON_ARRAY_APPEND(?, '$', 'duplicate'), ?)`);
        params.push(flags, flags, flags);
      }
    }

    try {
      await executeQuery(`UPDATE upload_sessions SET ${sets.join(", ")} WHERE id = ?`, [...params, row.id]);
    } catch (err) {
      // The server refused the extracted data (a value the extractor let
      // through, a packet too large): retrying would fail the same way.
      if (!isDataRejection(err)) throw err;
      await writeUnprocessable(row, result.checks);
    }
  } catch (err) {
    // The queue logs it, and only by sessionId (the id it holds means nothing
    // in the UI).
    err.sessionId = row.session_id;
    throw err;
  }
}

/**
 * @param {{store: import('../storage/fileStore.js').LocalFileStore,
 *          validate?: (id: number) => Promise<void>}} deps   `validate` defaults to validateStoredSession
 * @returns {{enqueue: (id: number) => void, idle: () => Promise<void>, recover: () => Promise<number>}}
 *          idle(): resolves when the queue is empty (for tests). recover(): returns how many rows were re-enqueued.
 */
export function createValidationQueue({ store, validate = (id) => validateStoredSession(id, { store }) }) {
  const pending = [];
  let running = null;

  async function drain() {
    while (pending.length > 0) {
      const id = pending.shift();
      try {
        await validate(id);
      } catch (err) {
        // The row stays 'validating', so the next start's recover() retries
        // it. Only identifiers are logged: an error message may quote archive
        // content (JSON.parse does), which can be participant data.
        logToFile("ERROR", "Upload validation failed", {
          sessionId: err?.sessionId ?? null,
          uploadSessionId: id,
          code: err?.code ?? err?.name ?? "Error",
        });
      }
    }
    running = null;
  }

  function enqueue(id) {
    if (!pending.includes(id)) pending.push(id);
    if (!running) running = drain();
  }

  return {
    enqueue,
    async idle() {
      while (running) await running;
    },
    async recover() {
      const rows = await executeQuery(`SELECT id FROM upload_sessions WHERE status = 'validating' ORDER BY id`);
      for (const { id } of rows) enqueue(id);
      return rows.length;
    },
  };
}
