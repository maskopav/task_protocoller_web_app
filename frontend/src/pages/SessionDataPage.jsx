import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { fetchProjectsList } from "../api/projects";
import { getProtocolsByProjectId } from "../api/protocols";
import { fetchSessionsForExport, downloadSessionDataZip } from "../api/sessionData";
import "./Pages.css";
import "./SessionDataPage.css";

// datetime-local inputs carry no timezone (the browser treats the value as
// local time), while session_date in the DB is UTC -- convert through Date
// so the filter actually lines up with stored timestamps, same as
// SystemLogsPage's since/until handling.
function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T") + (String(value).endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function SessionDataPage() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [protocols, setProtocols] = useState([]);

  const [projectId, setProjectId] = useState("");
  const [protocolId, setProtocolId] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const [sessions, setSessions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [truncated, setTruncated] = useState(false);
  const [maxSessions, setMaxSessions] = useState(null);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProjectsList().then(setProjects).catch(() => setProjects([]));
    // All protocols across every project -- filtered client-side by the
    // selected project below, same list shape used elsewhere (ProtocolDashboard).
    getProtocolsByProjectId().then(setProtocols).catch(() => setProtocols([]));
  }, []);

  const protocolOptions = useMemo(() => {
    if (!projectId) return protocols;
    return protocols.filter((p) => String(p.project_id) === String(projectId));
  }, [protocols, projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        projectId: projectId || undefined,
        protocolId: protocolId || undefined,
        since: localInputToIso(since) || undefined,
        until: localInputToIso(until) || undefined,
      };
      const data = await fetchSessionsForExport(filters);
      setSessions(data.sessions);
      setTruncated(data.truncated);
      setMaxSessions(data.maxSessions);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err.message || "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, [projectId, protocolId, since, until]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e.preventDefault();
    load();
  };

  // A project change can invalidate the currently-selected protocol (it may
  // belong to a different project) -- clear it rather than silently keep
  // filtering by a protocol the visible dropdown no longer shows.
  const handleProjectChange = (value) => {
    setProjectId(value);
    setProtocolId("");
  };

  const toggleSelected = (sessionId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === sessions.length ? new Set() : new Set(sessions.map((s) => s.session_id))
    );
  };

  const runDownload = async (sessionIds) => {
    setDownloading(true);
    setError(null);
    try {
      if (sessionIds) {
        await downloadSessionDataZip({ sessionIds });
      } else {
        await downloadSessionDataZip({
          filters: {
            projectId: projectId || undefined,
            protocolId: protocolId || undefined,
            since: localInputToIso(since) || undefined,
            until: localInputToIso(until) || undefined,
          },
        });
      }
    } catch (err) {
      setError(err.message || "Failed to download session data.");
    } finally {
      setDownloading(false);
    }
  };

  const allSelected = sessions.length > 0 && selectedIds.size === sessions.length;
  const busy = loading || downloading;

  return (
    <div className="dashboard-page">
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <h1 className="page-title">Session Data</h1>
        <p className="project-description">
          Download recordings, mic checks and task results for study sessions as a zip:
          a flat data/ folder with the audio files, plus sessions_summary.csv,
          task_results.csv (non-questionnaire task output), questionnaire_answers.csv
          (one row per question) and recordings_index.csv. Filter by project, protocol,
          and/or date range, then download everything matching or hand-pick sessions below.
        </p>
      </div>

      <form className="sd-filters" onSubmit={handleSubmit}>
        <label className="sd-filter-field">
          Project
          <select value={projectId} onChange={(e) => handleProjectChange(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
            ))}
          </select>
        </label>

        <label className="sd-filter-field">
          Protocol
          <select value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
            <option value="">All protocols</option>
            {protocolOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (v{p.version}){!projectId ? ` — ${p.project_name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="sd-filter-field">
          Since
          <input type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>

        <label className="sd-filter-field">
          Until
          <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>

        <button type="submit" className="sd-filter-submit" disabled={busy}>
          {loading ? "Loading..." : "Search"}
        </button>
      </form>

      {error && <p className="sd-error">{error}</p>}
      {truncated && (
        <p className="sd-warning">
          Showing the first {maxSessions} matching sessions. Narrow the filters to see the rest.
        </p>
      )}

      <div className="sd-toolbar">
        <span className="sd-count">
          {sessions.length} session{sessions.length === 1 ? "" : "s"} matched
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </span>
        <div className="sd-toolbar-actions">
          <button
            type="button"
            className="sd-btn-secondary"
            disabled={busy || selectedIds.size === 0}
            onClick={() => runDownload([...selectedIds])}
          >
            Download Selected ({selectedIds.size})
          </button>
          <button
            type="button"
            disabled={busy || sessions.length === 0}
            onClick={() => runDownload(null)}
          >
            {downloading ? "Preparing zip..." : `Download All Matching (${sessions.length})`}
          </button>
        </div>
      </div>

      <div className="sd-table-wrapper">
        {!loading && sessions.length === 0 && !error && (
          <p className="sd-empty">No sessions match these filters.</p>
        )}
        {sessions.length > 0 && (
          <table className="sd-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th>Session</th>
                <th>Participant</th>
                <th>Project</th>
                <th>Protocol</th>
                <th>Started</th>
                <th>Last activity</th>
                <th>Completed</th>
                <th>Recordings</th>
                <th>Results</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.session_id} className={selectedIds.has(s.session_id) ? "is-selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.session_id)}
                      onChange={() => toggleSelected(s.session_id)}
                    />
                  </td>
                  <td>{s.session_id}</td>
                  <td>{s.participant_name}</td>
                  <td>{s.project_name}</td>
                  <td>{s.protocol_name} (v{s.protocol_version})</td>
                  <td>{formatDateTime(s.session_date)}</td>
                  <td>{formatDateTime(s.last_activity_at)}</td>
                  <td>{s.completed ? "Yes" : "No"}</td>
                  <td>{s.recordings_count}</td>
                  <td>{s.task_results_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
