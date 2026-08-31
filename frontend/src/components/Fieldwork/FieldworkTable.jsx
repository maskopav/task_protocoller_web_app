// src/components/Fieldwork/FieldworkTable.jsx
import React, { useState, useMemo, useRef, useEffect } from "react";
import "../Protocols/Protocols.css";
import "./FieldworkTable.css";

// Participant lifecycle status, mirroring the `protocol_status` values
// computed by the `v_session_summary` DB view (backend/scripts/schema/create_views.sql).
// The "in_progress" <-> "incomplete" cutoff is the SESSION_RESUME_WINDOW_HOURS
// constant in backend/src/config/constants.js.
const STATUS_META = {
  created: {
    label: "Not Started",
    hint: "Assigned, but the participant hasn't opened the protocol yet.",
    dot: "#9ca3af",
    bg: "#f3f4f6",
    text: "#4b5563",
  },
  in_progress: {
    label: "In Progress",
    hint: "Started — can still resume from where they left off.",
    dot: "#f59e0b",
    bg: "#fef3c7",
    text: "#92400e",
  },
  incomplete: {
    label: "Incomplete",
    hint: "Return window expired — reopening the link restarts the protocol from the beginning.",
    dot: "#ef4444",
    bg: "#fee2e2",
    text: "#991b1b",
  },
  finished: {
    label: "Finished",
    hint: "Completed successfully.",
    dot: "#22c55e",
    bg: "#dcfce7",
    text: "#166534",
  },
};
const STATUS_ORDER = ["created", "in_progress", "incomplete", "finished"];

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// --- CSV-specific formatters: Excel-friendly rather than human-friendly.
// Empty cells stay truly empty (no "—" placeholder — Excel can't sort/filter
// a dash as blank), timestamps are passed through as the DB's own
// "YYYY-MM-DD HH:MM:SS" (unambiguous, Excel parses it as a real date/time
// natively), and duration is H:MM:SS (Excel recognizes it as a time value —
// sortable, usable in SUM — instead of the "1h 17m" text).
function csvDateTime(value) {
  return value || "";
}

function csvDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

// e.g. "2026-08-31_1432" — filesystem-safe, sorts chronologically, local time
function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const ORDINALS = ["1st", "2nd", "3rd"];
function ordinal(n) {
  return ORDINALS[n - 1] || `${n}th`;
}

// error_type values logged by MicCheck.jsx (utils/audioAnalysis.js)
const MIC_ERROR_LABELS = {
  muted: "No sound detected",
  "too-much-noise": "Too much background noise",
  "processing-error": "Processing error",
};

function formatMicCheck(r, emptyText = "—") {
  if (!r.mic_check_attempts) return emptyText;
  if (r.mic_check_pass_attempt) {
    return `Passed (${ordinal(r.mic_check_pass_attempt)} try)`;
  }
  const errorLabel = MIC_ERROR_LABELS[r.mic_check_last_error] || r.mic_check_last_error || "Unknown error";
  const tries = r.mic_check_attempts === 1 ? "1 try" : `${r.mic_check_attempts} tries`;
  return `Failed — ${errorLabel} (${tries})`;
}

function statusValue(r) {
  const meta = STATUS_META[r.protocol_status] || STATUS_META.created;
  const parts = [meta.label];
  if (r.was_resumed === 1) parts.push("Resumed");
  if (r.language_switched === 1) parts.push("Lang. switched");
  return parts.join(" | ");
}

const startedText = (r) => formatDateTime(r.session_started_at);
const lastActivityText = (r) => formatDateTime(r.session_last_activity_at);
const durationText = (r) => formatDuration(r.total_duration_seconds);
const currentStepText = (r) => r.last_activity_task_name || "—";
const languageCodeText = (r) => r.protocol_language_code || "—";
const sessionIdText = (r) => (r.session_id ?? "—").toString();

// The resume deadline only means anything while it's still live (in_progress)
// or just expired (incomplete) — for 'created'/'finished' there's no window
// to speak of, so the column stays blank there.
function isResumeRelevant(r) {
  return r.protocol_status === "in_progress" || r.protocol_status === "incomplete";
}

// "in 2d" / "in 5h" / "in 20m" for a still-open window — gives admins a
// scannable sense of urgency without doing date math in their head.
function formatRelative(deadlineStr) {
  const deadline = new Date(deadlineStr.replace(" ", "T") + "Z");
  const diffHours = (deadline.getTime() - Date.now()) / 3_600_000;
  if (diffHours <= 0) return "expired";
  if (diffHours < 1) return `in ${Math.round(diffHours * 60)}m`;
  if (diffHours < 48) return `in ${Math.round(diffHours)}h`;
  return `in ${Math.round(diffHours / 24)}d`;
}

// Every column pulls straight from `v_session_summary` fields. `required`
// columns can't be hidden (need at least identity + status); the rest are
// user-toggleable via the "Columns" menu, defaulting per `defaultVisible`.
// `value` returns the plain-text form used by CSV export, so the export
// always matches whatever columns are currently shown on screen; `render`
// is the (usually richer) on-screen JSX for the same data.
const COLUMN_DEFS = [
  {
    id: "participant",
    label: "Participant",
    required: true,
    value: (r) => r.participant_name || "",
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
    render: (r) => (
      <div className="protocol-cell">
        <span>{r.protocol_name}</span>
        {r.protocol_language && <span className="protocol-lang-tag">{r.protocol_language}</span>}
      </div>
    ),
  },
  {
    id: "status",
    label: "Status",
    required: true,
    value: statusValue,
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
    id: "started",
    label: "Started",
    value: (r) => csvDateTime(r.session_started_at),
    render: startedText,
  },
  {
    id: "lastActivity",
    label: "Last Activity",
    defaultVisible: false,
    value: (r) => csvDateTime(r.session_last_activity_at),
    render: lastActivityText,
  },
  {
    id: "resumableUntil",
    label: "Resumable Until",
    defaultVisible: false,
    value: (r) => (isResumeRelevant(r) ? csvDateTime(r.resumable_until) : ""),
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
    render: durationText,
  },
  {
    id: "currentStep",
    label: "Current Step",
    value: (r) => r.last_activity_task_name || "",
    render: (r) => <span className="fieldwork-current-step">{currentStepText(r)}</span>,
  },
  {
    id: "languageCode",
    label: "Lang. Code",
    defaultVisible: false,
    value: (r) => r.protocol_language_code || "",
    render: languageCodeText,
  },
  {
    id: "sessionId",
    label: "Session ID",
    defaultVisible: false,
    value: (r) => (r.session_id ?? "").toString(),
    render: sessionIdText,
  },
  {
    id: "micCheck",
    label: "Mic Check",
    defaultVisible: false,
    value: (r) => formatMicCheck(r, ""),
    render: (r) => {
      const text = formatMicCheck(r);
      const failed = r.mic_check_attempts && !r.mic_check_pass_attempt;
      return <span className={failed ? "fieldwork-mic-failed" : undefined}>{text}</span>;
    },
  },
];

const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFS.filter((c) => c.defaultVisible !== false).map((c) => c.id);
const COLUMNS_STORAGE_KEY = "fieldworkTable.visibleColumns";

function loadVisibleColumns() {
  try {
    const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {
    // ignore malformed/unavailable storage — fall back to defaults
  }
  return new Set(DEFAULT_VISIBLE_COLUMNS);
}

export default function FieldworkTable({ rows }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const columnsMenuRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visibleColumns]));
    } catch {
      // per-viewer convenience only — safe to skip if storage is unavailable
    }
  }, [visibleColumns]);

  // Close the columns menu on outside click (native <details> only toggles on <summary>)
  useEffect(() => {
    function handleClickOutside(e) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target)) {
        columnsMenuRef.current.removeAttribute("open");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeColumns = useMemo(
    () => COLUMN_DEFS.filter((c) => c.required || visibleColumns.has(c.id)),
    [visibleColumns]
  );

  // Filter Logic
  const filteredRows = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return rows.filter((r) => {
      const matchSearch =
        (r.participant_name || "").toLowerCase().includes(term) ||
        (r.protocol_name || "").toLowerCase().includes(term);
      const matchStatus = statusFilter === "ALL" || r.protocol_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rows, searchTerm, statusFilter]);

  // Status counts for the summary strip
  const statusCounts = useMemo(() => {
    const counts = { created: 0, in_progress: 0, incomplete: 0, finished: 0 };
    rows.forEach((r) => {
      if (counts[r.protocol_status] !== undefined) counts[r.protocol_status]++;
    });
    return counts;
  }, [rows]);

  // CSV Export Logic — mirrors exactly what's on screen: same columns, same
  // order, same currently-applied search/status filter.
  const handleExportCSV = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csvRows = [activeColumns.map((col) => escapeCsv(col.label)).join(",")];

    filteredRows.forEach((r) => {
      csvRows.push(activeColumns.map((col) => escapeCsv(col.value(r))).join(","));
    });

    // Leading BOM so Excel (the common opener on Windows) detects UTF-8
    // instead of guessing Windows-1252 and mangling non-ASCII characters
    // like the "—" dash into "â€”".
    const BOM = String.fromCharCode(0xfeff);
    const blob = new Blob([BOM + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `fieldwork_export_${timestampForFilename()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fieldwork-container">
      {/* Status Summary Strip */}
      <div className="fieldwork-summary">
        {STATUS_ORDER.map((key) => {
          const meta = STATUS_META[key];
          const active = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              className={`fieldwork-summary-card${active ? " is-active" : ""}`}
              onClick={() => setStatusFilter(active ? "ALL" : key)}
              title={meta.hint}
              style={{ "--accent": meta.dot }}
            >
              <span className="fieldwork-summary-value">{statusCounts[key]}</span>
              <span className="fieldwork-summary-label">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Controls Container */}
      <div className="fieldwork-toolbar">
        <div className="fieldwork-toolbar-filters">
          <input
            type="text"
            className="fieldwork-search"
            placeholder="Search participant or protocol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="fieldwork-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            {STATUS_ORDER.map((key) => (
              <option key={key} value={key}>
                {STATUS_META[key].label}
              </option>
            ))}
          </select>
        </div>

        <div className="fieldwork-toolbar-actions">
          <details className="fieldwork-columns-menu" ref={columnsMenuRef}>
            <summary className="fieldwork-columns-btn">Columns</summary>
            <div className="fieldwork-columns-panel">
              {COLUMN_DEFS.map((col) => (
                <label key={col.id} className="fieldwork-columns-option">
                  <input
                    type="checkbox"
                    checked={col.required || visibleColumns.has(col.id)}
                    disabled={col.required}
                    onChange={() => toggleColumn(col.id)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </details>
          <button className="btn-edit" onClick={handleExportCSV}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="table-scroll-area fieldwork-scroll-area">
        <table className="table fieldwork-table">
          <thead>
            <tr>
              {activeColumns.map((col) => (
                <th key={col.id}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} className="empty-row">No sessions found</td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.session_id ?? `pp-${r.participant_protocol_id}`}>
                  {activeColumns.map((col) => (
                    <td key={col.id}>{col.render(r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
