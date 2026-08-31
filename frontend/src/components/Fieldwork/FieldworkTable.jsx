// src/components/Fieldwork/FieldworkTable.jsx
import React, { useState, useMemo } from "react";
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

export default function FieldworkTable({ rows }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

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

  // CSV Export Logic
  const handleExportCSV = () => {
    const headers = [
      "Session ID",
      "Participant",
      "Protocol",
      "Language",
      "Started At",
      "Last Activity",
      "Duration (s)",
      "Was Resumed",
      "Language Switched",
      "Status",
    ];

    const csvRows = [headers.join(",")];

    filteredRows.forEach((r) => {
      const rowData = [
        r.session_id ?? "",
        `"${r.participant_name || ""}"`,
        `"${r.protocol_name || ""}"`,
        `"${r.protocol_language || ""}"`,
        `"${r.session_started_at || ""}"`,
        `"${r.session_last_activity_at || ""}"`,
        r.total_duration_seconds ?? "",
        r.was_resumed ? "Yes" : "No",
        r.language_switched ? "Yes" : "No",
        STATUS_META[r.protocol_status]?.label || r.protocol_status,
      ];
      csvRows.push(rowData.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "fieldwork_export.csv");
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
        <button className="btn-edit" onClick={handleExportCSV}>
          Export CSV
        </button>
      </div>

      <div className="table-scroll-area fieldwork-scroll-area">
        <table className="table fieldwork-table">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Protocol</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Current Step</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-row">No sessions found</td>
              </tr>
            ) : (
              filteredRows.map((r) => {
                const meta = STATUS_META[r.protocol_status] || STATUS_META.created;

                return (
                  <tr key={r.session_id ?? `pp-${r.participant_protocol_id}`}>
                    <td>
                      <div className="participant-cell">
                        <span className="participant-avatar">{getInitials(r.participant_name)}</span>
                        <span className="highlighted">{r.participant_name || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="protocol-cell">
                        <span>{r.protocol_name}</span>
                        {r.protocol_language && (
                          <span className="protocol-lang-tag">{r.protocol_language}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        title={meta.hint}
                        style={{ backgroundColor: meta.bg, color: meta.text }}
                      >
                        <span className="status-dot" style={{ backgroundColor: meta.dot }} />
                        {meta.label}
                      </span>
                      <div className="fieldwork-flags">
                        {r.was_resumed === 1 && <span>🔄 Resumed</span>}
                        {r.language_switched === 1 && <span>🌐 Lang. switched</span>}
                      </div>
                    </td>
                    <td>{formatDateTime(r.session_started_at)}</td>
                    <td>{formatDuration(r.total_duration_seconds)}</td>
                    <td className="fieldwork-current-step">{r.last_activity_task_name || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
