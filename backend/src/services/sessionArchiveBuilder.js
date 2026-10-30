// backend/src/services/sessionArchiveBuilder.js
// Turns a session export bundle (from sessionDataService.js) into a zip
// streamed straight to the HTTP response -- files are read and written one
// chunk at a time via ZipStreamWriter (Node core modules only, no zip
// library dependency), so memory use stays bounded regardless of how many
// recordings are included, instead of buffering the whole export in RAM.
import fs from "fs";
import path from "path";
import { ZipStreamWriter } from "../utils/zipStreamWriter.js";
import { buildCsv, jsonCellValue } from "../utils/csvBuilder.js";
import { logToFile, SYSTEM_LOG_PATH } from "../utils/logger.js";
import { collectSessionLogEntries, MAX_LOG_BYTES_PER_SESSION } from "../utils/sessionLogReader.js";
import { dateInYyyyMmDdHhMmSs, utcDbToLocal } from "../utils/dateFormatter.js";

const DATA_PATH = process.env.DATA_PATH;

// recording_url is always a filename generated server-side (see
// recordingController.js), never taken from user input -- path.basename()
// here is defense in depth so a corrupted/legacy DB row can never resolve
// outside DATA_PATH.
function safeFilename(name) {
  return path.basename(String(name || ""));
}

export function sessionArchiveFilename() {
  return `session_data_export_${dateInYyyyMmDdHhMmSs()}.zip`;
}

// Timestamp columns in every CSV below are converted from the DB's UTC to
// local time (utcDbToLocal) -- these files are read by people, like the
// admin UI. The zip's own filename and the recording filenames stay UTC
// (their "Z" suffix), and so do ISO "...Z" timestamps inside payload JSON.
function buildSessionsCsv(sessions) {
  const headers = [
    "session_id", "project_name", "protocol_name", "protocol_version",
    "participant_name", "session_started_at", "last_activity_at",
    "completed", "mic_check_result", "volume_check_result", "identifiers",
  ];
  const rows = sessions.map((s) => [
    s.session_id, s.project_name, s.protocol_name, s.protocol_version,
    s.participant_name, utcDbToLocal(s.session_date), utcDbToLocal(s.last_activity_at),
    s.completed ? "yes" : "no", s.mic_check_result, s.volume_check_result,
    jsonCellValue(s.identifiers),
  ]);
  return buildCsv(headers, rows);
}

// A JSON/JS value (DB JSON columns can come back already-parsed or as a raw
// string depending on driver/column) normalized to a real JS value.
function parseJsonMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// A questionnaire is identified by its task type, not its category -- the
// category is the questionnaire's own name (rbdsq, hhies, feedback, ...).
// The payload's own taskType marker is the fallback for a row whose
// protocol task/type couldn't be joined.
function isQuestionnaire(r) {
  if (r.task_type) return r.task_type === "questionnaire";
  return parseJsonMaybe(r.payload)?.taskType === "questionnaire";
}

// Non-questionnaire task results (visual/cognitive tasks etc.) -- shape
// varies per task type, so the payload stays a single raw JSON cell.
// Questionnaire rows are excluded here; see buildQuestionnaireAnswersCsv.
export function buildTaskResultsCsv(taskResults) {
  const headers = ["session_id", "task_category", "protocol_task_id", "repeat_index", "created_at", "payload"];
  const rows = taskResults
    .filter((r) => !isQuestionnaire(r))
    .map((r) => [
      r.session_id, r.category, r.protocol_task_id, r.repeat_index, utcDbToLocal(r.created_at), jsonCellValue(r.payload),
    ]);
  return buildCsv(headers, rows);
}

// Questionnaire answers, flattened to one row per question (not per task
// attempt) -- a questionnaire's question set is protocol-specific, so a
// single wide table with one column per question would need the union of
// every question across every exported protocol, mostly blank. This "long"
// format instead mirrors v_quest_results in create_views.sql. Question text
// comes from the protocol_task's own params.questions (params.title for the
// questionnaire name) -- the exact wording the participant actually saw for
// that protocol version, not a generic label.
//
// Answer keys are "<questionId>", "<questionId>__<language>" (a question
// repeated once per selected language -- repeatFor in Questionnaire.jsx) or
// "<questionId>__freeText__<option>" (a "please specify" entry); the suffix
// is appended to the base question's text so every row stays labelled.
function questionLabel(questionById, key) {
  const question = questionById.get(key);
  if (question) return question.text || key;

  const [baseId, ...rest] = key.split("__");
  const base = questionById.get(baseId);
  if (!base?.text) return key;
  if (rest[0] === "freeText") return `${base.text} [free text: ${rest.slice(1).join("__")}]`;
  return `${base.text} [${rest.join("__")}]`;
}

export function buildQuestionnaireAnswersCsv(taskResults) {
  const headers = [
    "session_id", "questionnaire", "protocol_task_id", "repeat_index",
    "question_id", "question_text", "answer", "created_at",
  ];
  const rows = [];

  for (const r of taskResults) {
    if (!isQuestionnaire(r)) continue;

    const payload = parseJsonMaybe(r.payload);
    const answers = payload && typeof payload.answers === "object" ? payload.answers : null;
    if (!answers) continue;

    const params = parseJsonMaybe(r.params) || {};
    const questions = Array.isArray(params.questions) ? params.questions : [];
    const questionById = new Map(questions.map((q) => [String(q.id), q]));

    for (const [questionId, value] of Object.entries(answers)) {
      const answerText = Array.isArray(value) ? value.join("; ") : String(value ?? "");
      rows.push([
        r.session_id, params.title || r.category || "", r.protocol_task_id, r.repeat_index,
        questionId, questionLabel(questionById, questionId), answerText, utcDbToLocal(r.created_at),
      ]);
    }
  }

  return buildCsv(headers, rows);
}

function buildRecordingsIndexCsv(recordings, micChecks) {
  const headers = ["session_id", "type", "task_category", "repeat_index", "filename", "duration_seconds", "created_at"];
  const rows = [
    ...recordings.map((r) => [
      r.session_id, "task_recording", r.category, r.repeat_index, safeFilename(r.recording_url), r.duration_seconds, utcDbToLocal(r.created_at),
    ]),
    ...micChecks.map((m) => [
      m.session_id, "mic_check", "", m.attempt_number, safeFilename(m.recording_url), m.duration_seconds, utcDbToLocal(m.created_at),
    ]),
  ];
  return buildCsv(headers, rows);
}

// Adds one recording file to the archive flat under data/<filename> (task
// recordings and mic checks side by side -- their filenames already encode
// the session, e.g. "S42_O1_C..." vs "S42_MICCHECK_A1_...", so there's no
// need to split them into per-session or per-type folders; recordings_index.csv
// is what ties a filename back to its session/task), plus (for task
// recordings only) its sidecar files if they exist -- face-landmark
// coordinates (.json/.json.gz) and segment timing (.segments.json), sharing
// the recording's base filename instead of .flac/.wav (see recordingController.js). Missing files are
// logged and skipped rather than failing the whole export -- a single lost
// file on disk shouldn't block every other session in the batch.
async function addRecordingFile(zip, { recordingUrl, sessionId, includeSidecar }) {
  const filename = safeFilename(recordingUrl);
  if (!filename || !DATA_PATH) return;

  const filePath = path.join(DATA_PATH, filename);
  if (fs.existsSync(filePath)) {
    await zip.addFileFromDisk(`data/${filename}`, filePath);
  } else {
    logToFile("WARN", "Recording file missing during session data export", { sessionId, filename });
  }

  if (!includeSidecar) return;
  const base = filename.replace(/\.(flac|wav)$/i, "");
  for (const ext of [".json", ".json.gz", ".segments.json"]) {
    const sidecar = `${base}${ext}`;
    const sidecarPath = path.join(DATA_PATH, sidecar);
    if (fs.existsSync(sidecarPath)) {
      await zip.addFileFromDisk(`data/${sidecar}`, sidecarPath);
    }
  }
}

// Log entries can't predate their session's row (the sessionId only exists
// once the session is created), so the earliest session_date bounds where in
// system_log.txt to start reading. The margin absorbs clock adjustments
// between the DB and the Node process.
const LOG_SEEK_MARGIN_MS = 60 * 60 * 1000;

export function earliestSessionStartIso(sessions) {
  let earliest = null;
  for (const s of sessions) {
    if (!s.session_date) return null; // unknown start -- read the whole log
    const date = s.session_date instanceof Date
      ? s.session_date
      : new Date(String(s.session_date).replace(" ", "T") + "Z");
    if (Number.isNaN(date.getTime())) return null;
    if (!earliest || date < earliest) earliest = date;
  }
  return earliest ? new Date(earliest.getTime() - LOG_SEEK_MARGIN_MS).toISOString() : null;
}

// One session's system log entries, kept exactly as written to
// system_log.txt (UTC timestamps, same as the admin log viewer) so lines can
// be cross-referenced with it.
export function buildSessionLogText(sessionId, { entries, truncated }) {
  const header = [
    `# System log entries for session ${sessionId}`,
    "# Timestamps are UTC, exactly as in system_log.txt / the admin log viewer.",
    "# Only entries tagged with this session's id are included -- e.g. errors",
    "# logged before the session was initialized (invalid token, page load) are not.",
  ];
  if (truncated) {
    header.push(`# TRUNCATED: over ${Math.round(MAX_LOG_BYTES_PER_SESSION / 1024 / 1024)} MB of entries; the rest is only in system_log.txt.`);
  }
  const body = entries.length > 0 ? entries.join("\n\n") : "(no log entries found for this session)";
  return `${header.join("\n")}\n\n${body}\n`;
}

// Logs are supplementary -- a failure reading them is noted inside the
// archive instead of failing the export of the actual data.
async function addSessionLogs(zip, sessions) {
  const sessionIds = sessions.map((s) => s.session_id);
  let logs;
  try {
    logs = await collectSessionLogEntries({
      logPath: SYSTEM_LOG_PATH,
      sessionIds,
      sinceIso: earliestSessionStartIso(sessions),
    });
  } catch (err) {
    logToFile("ERROR", "Failed to read system log for session data export", { error: err.message, stack: err.stack });
    await zip.addBuffer("logs/README.txt", `System log could not be read during export: ${err.message}\n`);
    return;
  }

  for (const id of sessionIds) {
    const bucket = logs.get(Number(id)) || { entries: [], truncated: false };
    await zip.addBuffer(`logs/session_${id}_log.txt`, buildSessionLogText(id, bucket));
  }
}

// Streams the archive to `res`, writing entries one at a time (four CSVs,
// per-session log files, then every recording/mic-check file) and resolving
// once the zip's central directory has been written and the response ended.
export async function streamSessionArchive({ sessions, recordings, micChecks, taskResults }, res) {
  const zip = new ZipStreamWriter(res);

  await zip.addBuffer("sessions_summary.csv", buildSessionsCsv(sessions));
  await zip.addBuffer("task_results.csv", buildTaskResultsCsv(taskResults));
  await zip.addBuffer("questionnaire_answers.csv", buildQuestionnaireAnswersCsv(taskResults));
  await zip.addBuffer("recordings_index.csv", buildRecordingsIndexCsv(recordings, micChecks));
  await addSessionLogs(zip, sessions);

  for (const r of recordings) {
    await addRecordingFile(zip, {
      recordingUrl: r.recording_url,
      sessionId: r.session_id,
      includeSidecar: true,
    });
  }
  for (const m of micChecks) {
    await addRecordingFile(zip, {
      recordingUrl: m.recording_url,
      sessionId: m.session_id,
      includeSidecar: false,
    });
  }

  await zip.finalize();
}
