// backend/src/services/sessionDataService.js
// DB access for the admin "download session data" export (see
// sessionDataController.js / sessionArchiveBuilder.js). Kept separate from
// both of those: this module only knows about SQL, not about zip/CSV
// building or HTTP.
import { executeQuery } from "../db/queryHelper.js";

// Mirrors the participant-display-name logic in v_session_summary
// (create_views.sql): prefer the external/hospital ID, otherwise fall back
// to name + birth date + sex.
function participantDisplayName(row) {
  if (row.external_id) return row.external_id;
  return [row.full_name, row.birth_date, row.sex].filter(Boolean).join(", ") || "Unknown";
}

const SESSION_SELECT = `
  s.id AS session_id,
  vpp.project_id, vpp.project_name,
  vpp.protocol_id, vpp.protocol_name, vpp.protocol_version,
  vpp.participant_id, vpp.external_id, vpp.full_name, vpp.birth_date, vpp.sex,
  s.session_date, s.last_activity_at, s.completed,
  s.mic_check_result, s.volume_check_result, s.identifiers
`;

function withParticipantName(rows) {
  return rows.map((row) => ({ ...row, participant_name: participantDisplayName(row) }));
}

// Every session row (not just the latest per participant/protocol
// assignment, unlike v_session_summary) matching the given filters --
// an admin exporting research data wants every attempt, including ones a
// participant abandoned and later restarted.
export async function findSessionsForExport({ projectId, protocolId, since, until, limit }) {
  const clauses = [];
  const params = [];

  if (projectId) {
    clauses.push("vpp.project_id = ?");
    params.push(projectId);
  }
  if (protocolId) {
    clauses.push("vpp.protocol_id = ?");
    params.push(protocolId);
  }
  if (since) {
    clauses.push("s.session_date >= ?");
    params.push(since);
  }
  if (until) {
    clauses.push("s.session_date <= ?");
    params.push(until);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit);

  const rows = await executeQuery(
    `SELECT
       ${SESSION_SELECT},
       (SELECT COUNT(*) FROM recordings r WHERE r.session_id = s.id) AS recordings_count,
       (SELECT COUNT(*) FROM task_results tr WHERE tr.session_id = s.id) AS task_results_count
     FROM sessions s
     JOIN v_participant_protocols vpp ON vpp.participant_protocol_id = s.participant_protocol_id
     ${whereSql}
     ORDER BY s.session_date DESC
     LIMIT ?`,
    params
  );

  return withParticipantName(rows);
}

// Full export bundle for a specific set of session ids: metadata plus every
// recording/mic-check/task-result row tied to them. Split into four small
// queries (rather than one sprawling join) so each result set stays a flat,
// easy-to-CSV shape.
export async function getSessionExportBundle(sessionIds) {
  if (!sessionIds || sessionIds.length === 0) {
    return { sessions: [], recordings: [], micChecks: [], taskResults: [] };
  }

  const placeholders = sessionIds.map(() => "?").join(",");

  const sessionRows = await executeQuery(
    `SELECT ${SESSION_SELECT}
     FROM sessions s
     JOIN v_participant_protocols vpp ON vpp.participant_protocol_id = s.participant_protocol_id
     WHERE s.id IN (${placeholders})`,
    sessionIds
  );

  const recordings = await executeQuery(
    `SELECT r.session_id, r.protocol_task_id, r.repeat_index, r.recording_url,
            r.duration_seconds, r.created_at, t.category
     FROM recordings r
     LEFT JOIN protocol_tasks pt ON pt.id = r.protocol_task_id
     LEFT JOIN tasks t ON t.id = pt.task_id
     WHERE r.session_id IN (${placeholders})`,
    sessionIds
  );

  const micChecks = await executeQuery(
    `SELECT session_id, recording_url, snr_score, duration_seconds, attempt_number, created_at
     FROM session_mic_checks
     WHERE session_id IN (${placeholders})`,
    sessionIds
  );

  // pt.params carries the questionnaire's own question definitions
  // (params.questions[].id/.text -- see v_quest_definitions in
  // create_views.sql) so the archive builder can label each answer with its
  // actual question text instead of just its raw id, without a second query.
  const taskResults = await executeQuery(
    `SELECT tr.session_id, tr.protocol_task_id, tr.repeat_index, tr.payload, tr.created_at, t.category, pt.params
     FROM task_results tr
     LEFT JOIN protocol_tasks pt ON pt.id = tr.protocol_task_id
     LEFT JOIN tasks t ON t.id = pt.task_id
     WHERE tr.session_id IN (${placeholders})`,
    sessionIds
  );

  return {
    sessions: withParticipantName(sessionRows),
    recordings,
    micChecks,
    taskResults,
  };
}
