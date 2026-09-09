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
import { logToFile } from "../utils/logger.js";
import { dateInYyyyMmDdHhMmSs } from "../utils/dateFormatter.js";

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

function buildSessionsCsv(sessions) {
  const headers = [
    "session_id", "project_name", "protocol_name", "protocol_version",
    "participant_name", "session_started_at", "last_activity_at",
    "completed", "mic_check_result", "volume_check_result", "identifiers",
  ];
  const rows = sessions.map((s) => [
    s.session_id, s.project_name, s.protocol_name, s.protocol_version,
    s.participant_name, s.session_date, s.last_activity_at,
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

// Non-questionnaire task results (visual/cognitive tasks etc.) -- shape
// varies per task type, so the payload stays a single raw JSON cell.
// Questionnaire rows are excluded here; see buildQuestionnaireAnswersCsv.
function buildTaskResultsCsv(taskResults) {
  const headers = ["session_id", "task_category", "protocol_task_id", "repeat_index", "created_at", "payload"];
  const rows = taskResults
    .filter((r) => r.category !== "questionnaire")
    .map((r) => [
      r.session_id, r.category, r.protocol_task_id, r.repeat_index, r.created_at, jsonCellValue(r.payload),
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
function buildQuestionnaireAnswersCsv(taskResults) {
  const headers = [
    "session_id", "questionnaire", "protocol_task_id", "repeat_index",
    "question_id", "question_text", "answer", "created_at",
  ];
  const rows = [];

  for (const r of taskResults) {
    if (r.category !== "questionnaire") continue;

    const payload = parseJsonMaybe(r.payload);
    const answers = payload && typeof payload.answers === "object" ? payload.answers : null;
    if (!answers) continue;

    const params = parseJsonMaybe(r.params) || {};
    const questions = Array.isArray(params.questions) ? params.questions : [];
    const questionById = new Map(questions.map((q) => [String(q.id), q]));

    for (const [questionId, value] of Object.entries(answers)) {
      // Free-text "please specify" entries are logged under a synthetic key
      // ("<questionId>__freeText__<option>"), not a real question id -- fall
      // back to the raw key as the label since there's no definition for it.
      const question = questionById.get(questionId);
      const answerText = Array.isArray(value) ? value.join("; ") : String(value ?? "");
      rows.push([
        r.session_id, params.title || "", r.protocol_task_id, r.repeat_index,
        questionId, question?.text || questionId, answerText, r.created_at,
      ]);
    }
  }

  return buildCsv(headers, rows);
}

function buildRecordingsIndexCsv(recordings, micChecks) {
  const headers = ["session_id", "type", "task_category", "repeat_index", "filename", "duration_seconds", "created_at"];
  const rows = [
    ...recordings.map((r) => [
      r.session_id, "task_recording", r.category, r.repeat_index, safeFilename(r.recording_url), r.duration_seconds, r.created_at,
    ]),
    ...micChecks.map((m) => [
      m.session_id, "mic_check", "", m.attempt_number, safeFilename(m.recording_url), m.duration_seconds, m.created_at,
    ]),
  ];
  return buildCsv(headers, rows);
}

// Adds one recording file to the archive flat under data/<filename> (task
// recordings and mic checks side by side -- their filenames already encode
// the session, e.g. "S42_O1_C..." vs "S42_MICCHECK_A1_...", so there's no
// need to split them into per-session or per-type folders; recordings_index.csv
// is what ties a filename back to its session/task), plus (for task
// recordings only) its gaze/pointer coordinate sidecar file if one exists --
// the sidecar shares the recording's base filename with .json/.json.gz
// instead of .flac/.wav (see recordingController.js). Missing files are
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
  for (const ext of [".json", ".json.gz"]) {
    const sidecar = `${base}${ext}`;
    const sidecarPath = path.join(DATA_PATH, sidecar);
    if (fs.existsSync(sidecarPath)) {
      await zip.addFileFromDisk(`data/${sidecar}`, sidecarPath);
    }
  }
}

// Streams the archive to `res`, writing entries one at a time (three CSVs,
// then every recording/mic-check file) and resolving once the zip's central
// directory has been written and the response ended.
export async function streamSessionArchive({ sessions, recordings, micChecks, taskResults }, res) {
  const zip = new ZipStreamWriter(res);

  await zip.addBuffer("sessions_summary.csv", buildSessionsCsv(sessions));
  await zip.addBuffer("task_results.csv", buildTaskResultsCsv(taskResults));
  await zip.addBuffer("questionnaire_answers.csv", buildQuestionnaireAnswersCsv(taskResults));
  await zip.addBuffer("recordings_index.csv", buildRecordingsIndexCsv(recordings, micChecks));

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
