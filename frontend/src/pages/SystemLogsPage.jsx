// frontend/src/pages/SystemLogsPage.jsx
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { fetchSystemLogs } from "../api/systemLogs";
import "./Pages.css";
import "./SystemLogsPage.css";

// datetime-local inputs carry no timezone (the browser treats the value as
// local time), while every system_log.txt entry is stamped in UTC -- convert
// through Date so the filter actually lines up with what's in the file,
// instead of silently comparing local wall-clock strings against UTC ones.
function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const LEVEL_CLASS = {
  FATAL: "log-entry-fatal",
  ERROR: "log-entry-error",
  WARN: "log-entry-warn",
  INFO: "log-entry-info",
};

function levelClassFor(entry) {
  const match = entry.match(/^\[[^\]]+\]\s*\[\w+\]\s*\[(\w+)\]/);
  return LEVEL_CLASS[match?.[1]] || "log-entry-info";
}

export default function SystemLogsPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [tail, setTail] = useState(200);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { entries } = await fetchSystemLogs({
        tail,
        search: search.trim() || undefined,
        since: localInputToIso(since) || undefined,
        until: localInputToIso(until) || undefined,
      });
      setEntries(entries);
    } catch (err) {
      setError(err.message || "Failed to load logs.");
    } finally {
      setLoading(false);
    }
  }, [search, since, until, tail]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e.preventDefault();
    load();
  };

  return (
    <div className="dashboard-page">
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <h1 className="page-title">System Logs</h1>
        <p className="project-description">
          Reads backend/logs/system_log.txt directly -- both frontend and backend
          entries land here. Times below are UTC to match the file; the since/until
          pickers accept your local time and convert automatically.
        </p>
      </div>

      <form className="log-filters" onSubmit={handleSubmit}>
        <label className="log-filter-field">
          Search
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="message, URL, session id..."
          />
        </label>

        <label className="log-filter-field">
          Since
          <input type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>

        <label className="log-filter-field">
          Until
          <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>

        <label className="log-filter-field log-filter-field-tail">
          Max entries
          <input
            type="number"
            min={1}
            max={2000}
            value={tail}
            onChange={(e) => setTail(e.target.value)}
          />
        </label>

        <button type="submit" className="log-filter-submit" disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </form>

      {error && <p className="log-error">{error}</p>}

      <div className="log-entries">
        {!loading && entries.length === 0 && !error && (
          <p className="log-empty">No entries match these filters.</p>
        )}
        {entries.map((entry, i) => (
          <pre key={i} className={`log-entry ${levelClassFor(entry)}`}>{entry}</pre>
        ))}
      </div>
    </div>
  );
}
