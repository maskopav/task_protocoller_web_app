// src/upload/sessionExtractor.js
// Rules: docs/upload_management/specification.md §4.2. Pure: no I/O.
// Input defaults follow NewShare/docs/dev/upload_data.md §6.
//
// The input is uploaded content, and quarantined (unauthenticated) uploads are
// validated too, so nothing here may trust a shape: list elements that are not
// objects are skipped, every string column is coerced and truncated to its
// column length, and every expansion is bounded.

/**
 * @typedef {Object} ExtractContext
 * @property {string} receivedAt                    ISO UTC
 * @property {string|null} currentConfigVersion
 * @property {{id: number, name: string, protocols: {id: number, name: string}[]}[]} projects
 *           the session site's projects with their protocols (for project/protocol matching)
 * @property {string[]} [existingFlags]             flags already on the row (e.g. "duplicate"), kept
 */

/**
 * @typedef {Object} ExtractedSession
 * @property {Object} columns   upload_sessions columns, keyed by column name:
 *   project_id, protocol_id, protocol_name, protocol_project, config_version,
 *   started_at, ended_at, processed_at, duration_s, tasks_total, tasks_done,
 *   tasks_skipped, audio_clips, video_clips, has_audio, recovered, interruptions,
 *   timeline_used, patient_code, visit_number,
 *   participant_fields (object), flags (string[]), exam_summary (object)
 *   Dates as 'YYYY-MM-DD HH:MM:SS.mmm' UTC (DATETIME(3) literal), or null.
 */

const LATE_MS = 72 * 3600 * 1000;
const DEVICE_EVENTS = new Set(["interrupted", "capture_failed"]);
const ATTENTION_FLAGS = new Set(["recovered", "interrupted", "nonstdMic", "nonstdCam"]);
// Fixed order = the order of ISSUES in ui.js, so stored flags are stable.
const FLAG_ORDER = ["recovered", "interrupted", "skipped", "retakes", "edited", "outdated", "late",
  "duplicate", "nonstdMic", "nonstdCam", "device"];

// Bounds on what an uploaded snapshot can make the server expand. Real
// protocols have a handful of tasks with single-digit repetitions; an unbounded
// nrepetition (1e9) once blocked the event loop until the process ran out of memory.
export const MAX_REPETITION = 100;
export const MAX_TASK_INSTANCES = 2000;
const MAX_TAKES = 100; // tracked per instance in the timeline summary

// Column lengths of upload_sessions. STRICT mode rejects a longer string, which
// used to leave the row 'validating' and fail again on every restart.
const COLUMN_LENGTH = { protocol_name: 100, protocol_project: 255, config_version: 32,
  patient_code: 255, visit_number: 64 };
const MAX_DURATION_S = 2 ** 31 - 1; // INT column
const TIMELINE_EVENTS = new Set(["START_BUTTON_PRESSED", "STOP_BUTTON_PRESSED", "TAKE_REJECTED"]);

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const objs = (v) => arr(v).filter(isObj);
const obj = (v) => (isObj(v) ? v : {});
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * A scalar as a string of at most `max` characters (code points, as varchar
 * counts them), or null. Objects and arrays give null: bound as a query
 * parameter, an array turns into a value list and breaks the SQL.
 */
export function str(v, max) {
  if (typeof v === "number" || typeof v === "boolean") v = String(v);
  if (typeof v !== "string") return null;
  return v.length <= max ? v : Array.from(v).slice(0, max).join("");
}

/**
 * Epoch ms of an ISO-ish timestamp, or null. The app writes 0-9 fractional
 * digits; the extra ones are truncated, not rounded, so a value never moves
 * into the next millisecond.
 */
export function parseTimestamp(s) {
  if (typeof s !== "string") return null;
  const m = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)(?:\.(\d+))?\s*(Z|[+-]\d\d:?\d\d)?$/.exec(s.trim());
  if (!m) return null;
  const ms = (m[3] ?? "").slice(0, 3).padEnd(3, "0");
  const t = Date.parse(`${m[1]}T${m[2]}.${ms}${m[4] ?? "Z"}`);
  return Number.isNaN(t) ? null : t;
}

/** 'YYYY-MM-DD HH:MM:SS.mmm' (UTC) or null. */
export function toDbDate(s) {
  const t = parseTimestamp(s);
  if (t === null) return null;
  const iso = new Date(t).toISOString();
  // DATETIME holds years 1000-9999. A zone offset can push a value outside
  // (toISOString then writes a 6-digit year), and STRICT mode rejects it.
  if (!/^\d{4}-/.test(iso) || iso < "1000") return null;
  return iso.replace("T", " ").replace("Z", "");
}

/**
 * The expected task instances of a session. A config task with nrepetition N
 * is N consecutive instances; the instance's index is its taskIndex.
 * Falls back to examination.tasks when the snapshot can't be resolved.
 * nrepetition is clamped to 1..MAX_REPETITION and the list stops at
 * MAX_TASK_INSTANCES. The returned array's `capped` is true when either applied.
 *
 * @returns {{taskIndex: number, type: string|null, subtype: string|null, repetition: number,
 *            result: 'Done'|'Skipped'|'Missing', exam: object|null}[] & {capped: boolean}}
 */
export function taskInstances(examination, snapshot) {
  const exam = obj(examination);
  const examTasks = objs(exam.tasks);
  const byIndex = new Map(examTasks.map((t) => [t.taskIndex, t]));
  const resultOf = (t) => (!t ? "Missing" : t.skipped ? "Skipped" : "Done");
  const label = (v) => str(v, 100);

  const protocol = objs(obj(snapshot).protocols).find((p) => p.name === exam.protocolName
    && (exam.protocolProject == null || p.project === exam.protocolProject));
  const configTasks = objs(protocol?.tasks);

  let out;
  let capped = false;
  if (!protocol || configTasks.length === 0) {
    capped = examTasks.length > MAX_TASK_INSTANCES;
    out = examTasks.slice(0, MAX_TASK_INSTANCES).map((t) => ({
      taskIndex: t.taskIndex, type: label(t.type), subtype: label(t.subtype),
      repetition: t.repetition ?? 1, result: resultOf(t), exam: t,
    }));
  } else {
    out = [];
    expand: for (const ct of configTasks) {
      const want = Math.floor(Number(ct.nrepetition)) || 1;
      if (want > MAX_REPETITION) capped = true;
      const n = Math.min(MAX_REPETITION, Math.max(1, want));
      for (let r = 1; r <= n; r++) {
        if (out.length >= MAX_TASK_INSTANCES) {
          capped = true;
          break expand;
        }
        const taskIndex = out.length;
        const t = byIndex.get(taskIndex) ?? null;
        out.push({
          taskIndex, type: label(t?.type ?? ct.type), subtype: label(t?.subtype ?? ct.subtype),
          repetition: t?.repetition ?? r, result: resultOf(t), exam: t,
        });
      }
    }
  }
  out.capped = capped;
  return out;
}

// Kept take and rejected takes per instance, from the original event log.
// Indexes must be integers: they become map and sort keys, and an object there
// would have the template literal call a JSON-supplied "toString". Instance and
// take counts are capped so a hostile event log cannot blow up the summary.
function timelineSegments(timelineOriginal, timelineEdited, useEdited) {
  const perInstance = new Map();
  const slot = (taskIndex, repetition) => {
    const key = `${taskIndex}/${repetition}`;
    if (!perInstance.has(key)) {
      if (perInstance.size >= MAX_TASK_INSTANCES) return null;
      perInstance.set(key, { taskIndex, repetition, takes: new Map() });
    }
    return perInstance.get(key);
  };
  const take = (s, n) => {
    if (!s.takes.has(n)) {
      if (s.takes.size >= MAX_TAKES) return null;
      s.takes.set(n, { take: n, startSample: null, stopSample: null, rejected: false, reason: null });
    }
    return s.takes.get(n);
  };

  for (const e of objs(obj(timelineOriginal).events)) {
    if (!TIMELINE_EVENTS.has(e.type)) continue;
    const taskIndex = int(e.taskIndex);
    const n = int(e.take);
    const repetition = e.repetition == null ? 1 : int(e.repetition);
    if (taskIndex === null || n === null || repetition === null) continue;
    const s = slot(taskIndex, repetition);
    const t = s && take(s, n);
    if (!t) continue;
    if (e.type === "START_BUTTON_PRESSED") t.startSample = finite(e.sampleOffset);
    else if (e.type === "STOP_BUTTON_PRESSED") t.stopSample = finite(e.sampleOffset);
    else {
      t.rejected = true;
      t.reason = str(e.reason, 255);
    }
  }

  const result = new Map();
  for (const [key, s] of perInstance) {
    const takes = [...s.takes.values()].sort((a, b) => a.take - b.take);
    const kept = [...takes].reverse().find((t) => !t.rejected && t.startSample !== null && t.stopSample !== null)
      ?? [...takes].reverse().find((t) => !t.rejected) ?? null;
    result.set(key, {
      taskIndex: s.taskIndex,
      repetition: s.repetition,
      kept: kept && { take: kept.take, startSample: kept.startSample, stopSample: kept.stopSample },
      rejected: takes.filter((t) => t.rejected)
        .map((t) => ({ take: t.take, startSample: t.startSample, stopSample: t.stopSample, reason: t.reason })),
    });
  }

  // When the editor moved boundaries, its segment list is what the clips were cut from.
  if (useEdited) {
    for (const g of objs(obj(timelineEdited).segments)) {
      const taskIndex = int(g.taskIndex);
      const repetition = g.repetition == null ? 1 : int(g.repetition);
      if (taskIndex === null || repetition === null) continue;
      const key = `${taskIndex}/${repetition}`;
      if (!result.has(key) && result.size >= MAX_TASK_INSTANCES) continue;
      const cur = result.get(key) ?? { taskIndex, repetition, kept: null, rejected: [] };
      cur.kept = { take: cur.kept?.take ?? null, startSample: finite(g.startSample), stopSample: finite(g.stopSample) };
      result.set(key, cur);
    }
  }
  return [...result.values()].sort((a, b) => a.taskIndex - b.taskIndex || a.repetition - b.repetition);
}

/**
 * @param {import('./archiveValidator.js').ParsedArchive} parsed
 * @param {ExtractContext} ctx
 * @returns {ExtractedSession}
 */
export function extractSession(parsed, ctx) {
  const exam = obj(parsed.examination);
  const manifest = obj(parsed.manifest);
  const fields = obj(obj(parsed.participant).fields);
  const processing = obj(exam.processing);
  const hardware = obj(exam.hardware);
  const interruptions = arr(exam.interruptions);
  const examTasks = objs(exam.tasks);

  const instances = taskInstances(exam, parsed.snapshot);
  const timelineUsed = processing.timelineUsed === "edited" ? "edited" : "original";
  const configVersion = str(exam.configVersion ?? manifest.configVersion, COLUMN_LENGTH.config_version);

  const startedAtMs = parseTimestamp(exam.startedAt);
  const endedAtMs = parseTimestamp(exam.endedAt);
  const processedAtMs = parseTimestamp(processing.processedAt);
  const endMs = endedAtMs ?? processedAtMs;
  const durationRaw = startedAtMs !== null && endMs !== null ? Math.max(0, Math.round((endMs - startedAtMs) / 1000)) : null;
  const durationS = durationRaw !== null && durationRaw <= MAX_DURATION_S ? durationRaw : null;

  // Matched on the full value, so a truncated name never matches a real protocol.
  const project = arr(ctx.projects).find((p) => p.name === exam.protocolProject) ?? null;
  const protocol = project ? arr(project.protocols).find((p) => p.name === exam.protocolName) ?? null : null;

  // Every use differs from the configured device: a single use of the
  // configured one (e.g. before it was swapped) makes the session standard.
  const nonstd = (uses, configured) => arr(uses).length > 0 && !!configured
    && arr(uses).every((u) => u?.deviceId !== configured);

  const receivedMs = parseTimestamp(ctx.receivedAt) ?? Date.parse(ctx.receivedAt);
  const computed = {
    recovered: exam.recovered === true,
    interrupted: interruptions.length > 0,
    skipped: examTasks.some((t) => t.skipped === true),
    retakes: examTasks.some((t) => (finite(t.takes) ?? 0) > 1),
    edited: processing.timelineUsed === "edited",
    outdated: !!configVersion && !!ctx.currentConfigVersion && configVersion < ctx.currentConfigVersion,
    late: endMs !== null && Number.isFinite(receivedMs) && receivedMs - endMs > LATE_MS,
    duplicate: false,
    nonstdMic: nonstd(hardware.micUses, hardware.configuredMicDeviceId),
    nonstdCam: nonstd(hardware.cameraUses, hardware.configuredCameraDeviceId),
    device: arr(hardware.events).some((e) => DEVICE_EVENTS.has(e?.event)),
  };
  const flagSet = new Set([...FLAG_ORDER.filter((k) => computed[k]), ...arr(ctx.existingFlags)]);

  const sampleRate = obj(parsed.timelineOriginal).sampleRate
    ?? (timelineUsed === "edited" ? obj(parsed.timelineEdited).sampleRate : undefined)
    ?? obj(exam.captureFormat).sampleRate ?? null;

  const nonNegInt = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const examSummary = {
    tasks: instances.map((i) => ({
      taskIndex: i.taskIndex,
      type: i.type,
      subtype: i.subtype,
      repetition: i.repetition,
      result: i.result,
      takes: i.exam?.takes ?? 0,
      clipFile: i.exam?.clipFile ?? null,
      videoFile: i.exam?.videoFile ?? null,
      // F-110: set with videoFile; videoComplete=false means the video is shorter than the audio.
      videoComplete: typeof i.exam?.videoComplete === "boolean" ? i.exam.videoComplete : null,
      videoDurationMs: nonNegInt(i.exam?.videoDurationMs),
      audioDurationMs: nonNegInt(i.exam?.audioDurationMs),
      questionnaireAnswers: i.exam?.questionnaireAnswers ?? null,
    })),
    captureFormat: exam.captureFormat ?? null,
    hardware: exam.hardware ?? null,
    interruptions,
    videoTakes: arr(exam.videoTakes),
    sampleRate,
    timelineUsed,
    timeline: timelineSegments(parsed.timelineOriginal, parsed.timelineEdited,
      timelineUsed === "edited" && !!parsed.timelineEdited),
  };

  const count = (r) => instances.filter((i) => i.result === r).length;
  return {
    columns: {
      project_id: project?.id ?? null,
      protocol_id: protocol?.id ?? null,
      protocol_name: str(exam.protocolName, COLUMN_LENGTH.protocol_name),
      protocol_project: str(exam.protocolProject, COLUMN_LENGTH.protocol_project),
      config_version: configVersion,
      started_at: toDbDate(exam.startedAt),
      ended_at: toDbDate(exam.endedAt),
      processed_at: toDbDate(processing.processedAt),
      duration_s: durationS,
      tasks_total: instances.length,
      tasks_done: count("Done"),
      tasks_skipped: count("Skipped"),
      audio_clips: examTasks.filter((t) => t.clipFile).length,
      video_clips: examTasks.filter((t) => t.videoFile).length,
      has_audio: exam.captureFormat != null,
      recovered: computed.recovered,
      interruptions: interruptions.length,
      timeline_used: timelineUsed,
      patient_code: str(fields.patient_code, COLUMN_LENGTH.patient_code),
      visit_number: str(fields.visit_number, COLUMN_LENGTH.visit_number),
      participant_fields: fields,
      flags: [...flagSet],
      exam_summary: examSummary,
    },
  };
}

/** needsAttention as the UI defines it (spec §4.2). */
export function needsAttention({ status, qc, flags }) {
  return status === "invalid" || qc === "review" || arr(flags).some((f) => ATTENTION_FLAGS.has(f));
}
