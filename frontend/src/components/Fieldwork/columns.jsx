// src/components/Fieldwork/columns.jsx
// Column config module (not a component) — exports data alongside JSX
// render helpers, which fast-refresh's single-export-type rule disallows.
/* eslint-disable react-refresh/only-export-components */
import {
  getInitials,
  formatDateTime,
  formatDuration,
  csvDateTime,
  csvDuration,
  formatMicCheck,
  statusValue,
  isResumeRelevant,
  formatRelative,
} from "./formatters";
import { STATUS_META, STATUS_ORDER } from "./statusMeta";

const startedText = (r) => formatDateTime(r.session_started_at);
const lastActivityText = (r) => formatDateTime(r.session_last_activity_at);
const durationText = (r) => formatDuration(r.total_duration_seconds);
const currentStepText = (r) => r.last_activity_task_name || "—";
const languageCodeText = (r) => r.protocol_language_code || "—";
const sessionIdText = (r) => (r.session_id ?? "—").toString();

// Every column pulls straight from `v_session_summary` fields. `required`
// columns can't be hidden (need at least identity + status); the rest are
// user-toggleable via the "Columns" menu, defaulting per `defaultVisible`.
//
// `value` returns the plain-text form used by CSV export, so the export
// always matches whatever columns are currently shown on screen; `render`
// is the (usually richer) on-screen JSX for the same data.
//
// `filterValue` is what the column's header filter matches against (falls
// back to `value` when omitted). `filterType: "select"` renders a dropdown
// of `filterOptions` instead of a free-text input. `sortValue` is the
// comparable primitive used when the column's sort is active (falls back
// to `value` when omitted).
export const COLUMN_DEFS = [
  {
    id: "participant",
    label: "Respondent ID",
    required: true,
    value: (r) => r.participant_name || "",
    sortValue: (r) => (r.participant_name || "").toLowerCase(),
    render: (r) => (
      <div className="participant-cell">
        <span className="participant-avatar">{getInitials(r.participant_name)}</span>
        <span className="highlighted">{r.participant_name || "—"}</span>
      </div>
    ),
  },
  {
    id: "protocol",
    label: "Protocol",
    value: (r) => r.protocol_name + (r.protocol_language ? ` (${r.protocol_language})` : ""),
    sortValue: (r) => (r.protocol_name || "").toLowerCase(),
    render: (r) => (
      <div className="protocol-cell">
        <span>{r.protocol_name}</span>
        {r.protocol_language && <span className="protocol-lang-tag">{r.protocol_language}</span>}
      </div>
    ),
  },
  {
    id: "protocolId",
    label: "Protocol ID",
    defaultVisible: false,
    // The actual protocols.id — unlike "Protocol" (name + language, can be
    // shared across variants), this uniquely identifies one specific
    // protocol+language+version. Surfaced so an admin can copy it into the
    // outreach import to disambiguate a respondent with more than one active
    // protocol in this project.
    value: (r) => (r.protocol_id ?? "").toString(),
    sortValue: (r) => r.protocol_id ?? -1,
    render: (r) => (r.protocol_id ?? "—").toString(),
  },
  {
    id: "status",
    label: "Status",
    required: true,
    value: statusValue,
    filterType: "select",
    filterValue: (r) => r.protocol_status,
    filterOptions: STATUS_ORDER.map((key) => ({ value: key, label: STATUS_META[key].label })),
    sortValue: (r) => STATUS_ORDER.indexOf(r.protocol_status),
    render: (r) => {
      const meta = STATUS_META[r.protocol_status] || STATUS_META.created;
      return (
        <>
          <span className="status-badge" title={meta.hint} style={{ backgroundColor: meta.bg, color: meta.text }}>
            <span className="status-dot" style={{ backgroundColor: meta.dot }} />
            {meta.label}
          </span>
          <div className="fieldwork-flags">
            {r.was_resumed === 1 && <span>🔄 Resumed</span>}
            {r.language_switched === 1 && <span>🌐 Lang. switched</span>}
          </div>
        </>
      );
    },
  },
  {
    id: "progress",
    label: "Progress",
    // Rough gauge of how far into the protocol they are — the whole point
    // is to make sense of a session without knowing this protocol's task
    // list by heart, so it's on by default.
    value: (r) => (r.completion_percent ?? "").toString(),
    sortValue: (r) => r.completion_percent ?? -1,
    render: (r) => {
      if (r.completion_percent === null || r.completion_percent === undefined) {
        return <span className="fieldwork-current-step">—</span>;
      }
      return (
        <div className="fieldwork-progress">
          <div className="fieldwork-progress-track">
            <div className="fieldwork-progress-fill" style={{ width: `${r.completion_percent}%` }} />
          </div>
          <span className="fieldwork-progress-label">{r.completion_percent}%</span>
        </div>
      );
    },
  },
  {
    id: "linkSentAt",
    label: "Link Sent",
    // When the survey agency actually contacted the participant with the
    // link — set via the Fieldwork CSV import, distinct from "Started".
    value: (r) => csvDateTime(r.link_sent_at),
    sortValue: (r) => r.link_sent_at || "",
    render: (r) => formatDateTime(r.link_sent_at),
  },
  // Up to 3 follow-up calls the agency logs when a respondent is stuck —
  // one date + one notes column per call attempt, all hidden by default
  // since most rows never need them.
  ...[1, 2, 3].flatMap((n) => [
    {
      id: `call${n}At`,
      label: `Call ${n}`,
      defaultVisible: false,
      value: (r) => csvDateTime(r[`call_${n}_at`]),
      sortValue: (r) => r[`call_${n}_at`] || "",
      render: (r) => formatDateTime(r[`call_${n}_at`]),
    },
    {
      id: `call${n}Notes`,
      label: `Call ${n} Notes`,
      defaultVisible: false,
      value: (r) => r[`call_${n}_notes`] || "",
      sortValue: (r) => (r[`call_${n}_notes`] || "").toLowerCase(),
      render: (r) => <span className="fieldwork-current-step">{r[`call_${n}_notes`] || "—"}</span>,
    },
  ]),
  {
    id: "started",
    label: "Started",
    value: (r) => csvDateTime(r.session_started_at),
    sortValue: (r) => r.session_started_at || "",
    render: startedText,
  },
  {
    id: "lastActivity",
    label: "Last Activity",
    defaultVisible: false,
    value: (r) => csvDateTime(r.session_last_activity_at),
    sortValue: (r) => r.session_last_activity_at || "",
    render: lastActivityText,
  },
  {
    id: "resumableUntil",
    label: "Resumable Until",
    defaultVisible: false,
    value: (r) => (isResumeRelevant(r) ? csvDateTime(r.resumable_until) : ""),
    sortValue: (r) => r.resumable_until || "",
    render: (r) => {
      if (!isResumeRelevant(r)) return "—";
      return (
        <span className={r.protocol_status === "incomplete" ? "fieldwork-resumable-expired" : undefined}>
          {formatDateTime(r.resumable_until)}
          {r.protocol_status === "in_progress" && (
            <span className="fieldwork-resumable-relative"> ({formatRelative(r.resumable_until)})</span>
          )}
        </span>
      );
    },
  },
  {
    id: "duration",
    label: "Duration",
    value: (r) => csvDuration(r.total_duration_seconds),
    sortValue: (r) => r.total_duration_seconds ?? -1,
    render: durationText,
  },
  {
    id: "currentStep",
    label: "Current Step",
    value: (r) => r.last_activity_task_name || "",
    sortValue: (r) => (r.last_activity_task_name || "").toLowerCase(),
    render: (r) => <span className="fieldwork-current-step">{currentStepText(r)}</span>,
  },
  {
    id: "languageCode",
    label: "Lang. Code",
    defaultVisible: false,
    value: (r) => r.protocol_language_code || "",
    sortValue: (r) => (r.protocol_language_code || "").toLowerCase(),
    render: languageCodeText,
  },
  {
    id: "sessionId",
    label: "Session ID",
    defaultVisible: false,
    value: (r) => (r.session_id ?? "").toString(),
    sortValue: (r) => r.session_id ?? -1,
    render: sessionIdText,
  },
  {
    id: "micCheck",
    label: "Mic Check",
    defaultVisible: false,
    value: (r) => formatMicCheck(r, ""),
    sortValue: (r) => r.mic_check_attempts ?? -1,
    render: (r) => {
      const text = formatMicCheck(r);
      const failed = r.mic_check_attempts && !r.mic_check_pass_attempt;
      return <span className={failed ? "fieldwork-mic-failed" : undefined}>{text}</span>;
    },
  },
];

export const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFS.filter((c) => c.defaultVisible !== false).map((c) => c.id);
