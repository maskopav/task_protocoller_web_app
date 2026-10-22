// src/upload/sessionExtractor.js
// Rules: docs/upload_management/specification.md §4.2. Pure: no I/O.
// Input defaults follow NewShare/docs/dev/upload_data.md §6.

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

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

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
  return t === null ? null : new Date(t).toISOString().replace("T", " ").replace("Z", "");
}

/**
 * The expected task instances of a session. A config task with nrepetition N
 * is N consecutive instances; the instance's index is its taskIndex.
 * Falls back to examination.tasks when the snapshot can't be resolved.
 *
 * @returns {{taskIndex: number, type: string|null, subtype: string|null, repetition: number,
 *            result: 'Done'|'Skipped'|'Missing', exam: object|null}[]}
 */
export function taskInstances(examination, snapshot) {
  const exam = obj(examination);
  const examTasks = arr(exam.tasks);
  const byIndex = new Map(examTasks.map((t) => [t.taskIndex, t]));
  const resultOf = (t) => (!t ? "Missing" : t.skipped ? "Skipped" : "Done");

  const protocol = arr(obj(snapshot).protocols).find((p) => p?.name === exam.protocolName
    && (exam.protocolProject == null || p.project === exam.protocolProject));
  const configTasks = arr(protocol?.tasks);

  if (!protocol || configTasks.length === 0) {
    return examTasks.map((t) => ({
      taskIndex: t.taskIndex, type: t.type ?? null, subtype: t.subtype ?? null,
      repetition: t.repetition ?? 1, result: resultOf(t), exam: t,
    }));
  }

  const out = [];
  for (const ct of configTasks) {
    const n = Math.max(1, Number(ct?.nrepetition) || 1);
    for (let r = 1; r <= n; r++) {
      const taskIndex = out.length;
      const t = byIndex.get(taskIndex) ?? null;
      out.push({
        taskIndex, type: t?.type ?? ct?.type ?? null, subtype: t?.subtype ?? ct?.subtype ?? null,
        repetition: t?.repetition ?? r, result: resultOf(t), exam: t,
      });
    }
  }
  return out;
}

// Kept take and rejected takes per instance, from the original event log.
function timelineSegments(timelineOriginal, timelineEdited, useEdited) {
  const perInstance = new Map();
  const slot = (taskIndex, repetition) => {
    const key = `${taskIndex}/${repetition}`;
    if (!perInstance.has(key)) perInstance.set(key, { taskIndex, repetition, takes: new Map() });
    return perInstance.get(key);
  };
  const take = (s, n) => {
    if (!s.takes.has(n)) s.takes.set(n, { take: n, startSample: null, stopSample: null, rejected: false, reason: null });
    return s.takes.get(n);
  };

  for (const e of arr(obj(timelineOriginal).events)) {
    if (e?.taskIndex == null || e.take == null) continue;
    const s = slot(e.taskIndex, e.repetition ?? 1);
    if (e.type === "START_BUTTON_PRESSED") take(s, e.take).startSample = e.sampleOffset ?? null;
    else if (e.type === "STOP_BUTTON_PRESSED") take(s, e.take).stopSample = e.sampleOffset ?? null;
    else if (e.type === "TAKE_REJECTED") {
      const t = take(s, e.take);
      t.rejected = true;
      t.reason = e.reason ?? null;
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
    for (const g of arr(obj(timelineEdited).segments)) {
      const key = `${g.taskIndex}/${g.repetition ?? 1}`;
      const cur = result.get(key) ?? { taskIndex: g.taskIndex, repetition: g.repetition ?? 1, kept: null, rejected: [] };
      cur.kept = { take: cur.kept?.take ?? null, startSample: g.startSample ?? null, stopSample: g.stopSample ?? null };
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
  const examTasks = arr(exam.tasks);

  const instances = taskInstances(exam, parsed.snapshot);
  const timelineUsed = processing.timelineUsed === "edited" ? "edited" : "original";
  const configVersion = exam.configVersion ?? manifest.configVersion ?? null;

  const startedAtMs = parseTimestamp(exam.startedAt);
  const endedAtMs = parseTimestamp(exam.endedAt);
  const processedAtMs = parseTimestamp(processing.processedAt);
  const endMs = endedAtMs ?? processedAtMs;
  const durationS = startedAtMs !== null && endMs !== null ? Math.max(0, Math.round((endMs - startedAtMs) / 1000)) : null;

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
    skipped: examTasks.some((t) => t?.skipped === true),
    retakes: examTasks.some((t) => (t?.takes ?? 0) > 1),
    edited: processing.timelineUsed === "edited",
    outdated: !!configVersion && !!ctx.currentConfigVersion && String(configVersion) < ctx.currentConfigVersion,
    late: endMs !== null && Number.isFinite(receivedMs) && receivedMs - endMs > LATE_MS,
    duplicate: false,
    nonstdMic: nonstd(hardware.micUses, hardware.configuredMicDeviceId),
    nonstdCam: nonstd(hardware.cameraUses, hardware.configuredCameraDeviceId),
    device: arr(hardware.events).some((e) => DEVICE_EVENTS.has(e?.event)),
  };
  const flagSet = new Set([...FLAG_ORDER.filter((k) => computed[k]), ...arr(ctx.existingFlags)]);

  const sampleRate = obj(parsed.timelineOriginal).sampleRate
    ?? (timelineUsed === "edited" ? obj(parsed.timelineEdited).sampleRate : undefined)
    ?? exam.captureFormat?.sampleRate ?? null;

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
      protocol_name: exam.protocolName ?? null,
      protocol_project: exam.protocolProject ?? null,
      config_version: configVersion,
      started_at: toDbDate(exam.startedAt),
      ended_at: toDbDate(exam.endedAt),
      processed_at: toDbDate(processing.processedAt),
      duration_s: durationS,
      tasks_total: instances.length,
      tasks_done: count("Done"),
      tasks_skipped: count("Skipped"),
      audio_clips: examTasks.filter((t) => t?.clipFile).length,
      video_clips: examTasks.filter((t) => t?.videoFile).length,
      has_audio: exam.captureFormat != null,
      recovered: computed.recovered,
      interruptions: interruptions.length,
      timeline_used: timelineUsed,
      patient_code: fields.patient_code ?? null,
      visit_number: fields.visit_number ?? null,
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
