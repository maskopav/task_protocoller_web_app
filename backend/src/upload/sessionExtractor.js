// src/upload/sessionExtractor.js — CONTRACT STUB (wave 0). Implemented by task B.
// Rules: docs/upload_management/specification.md §4.2. Pure: no I/O.

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

/**
 * @param {import('./archiveValidator.js').ParsedArchive} parsed
 * @param {ExtractContext} ctx
 * @returns {ExtractedSession}
 */
export function extractSession(parsed, ctx) {
  throw new Error("not implemented");
}

/** needsAttention as the UI defines it (spec §4.2). */
export function needsAttention({ status, qc, flags }) {
  throw new Error("not implemented");
}
