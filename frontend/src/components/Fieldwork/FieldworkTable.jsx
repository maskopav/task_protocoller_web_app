// src/components/Fieldwork/FieldworkTable.jsx
import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "../Participants/ParticipantProtocolTable.css"; // Reusing existing table styles

export default function FieldworkTable({ rows }) {
  const { t } = useTranslation(["admin", "common"]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Filter Logic
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch = (r.participant_name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.protocol_name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "ALL" || r.protocol_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rows, searchTerm, statusFilter]);

  // CSV Export Logic
  const handleExportCSV = () => {
    const headers = [
      "Session ID", 
      "Participant Name", 
      "Protocol", 
      "Language",
      "Started At", 
      "Last Activity", 
      "Duration (s)", 
      "Was Resumed",
      "Language Switched",
      "Status"
    ];
    
    const csvRows = [headers.join(",")];

    filteredRows.forEach(r => {
      const rowData = [
        r.session_id,
        `"${r.participant_name || ''}"`,
        `"${r.protocol_name || ''}"`,
        `"${r.protocol_language || ''}"`,
        `"${r.session_started_at || ''}"`,
        `"${r.session_last_activity_at || ''}"`,
        r.total_duration_seconds || 0,
        r.was_resumed ? "Yes" : "No",
        r.language_switched ? "Yes" : "No",
        r.protocol_status
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
  };

  // Helper for status badge styling
  const getStatusStyle = (status) => {
    if (status === 'Finished') return { bg: '#dcfce7', text: '#166534' }; // Green (active)
    if (status === 'Resumed') return { bg: '#fef08a', text: '#854d0e' }; // Yellow/Orange
    return { bg: '#d1d7e2', text: '#374151' }; // Gray (inactive)
  };

  return (
    <div className="table-container">
      {/* Controls Container */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem" }}>
          <input 
            type="text" 
            placeholder={t("search", { ns: "common" }) + "..."} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)" }}
          />
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", backgroundColor: "white" }}
          >
            <option value="ALL">All Statuses</option>
            <option value="Finished">Finished</option>
            <option value="Resumed">Resumed</option>
            <option value="Incomplete">Incomplete</option>
          </select>
        </div>
        <button className="btn-edit" onClick={handleExportCSV}>
          Export CSV
        </button>
      </div>

      <div className="table-scroll-area">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Participant</th>
              <th>Protocol</th>
              <th>Language</th>
              <th>Start Time</th>
              <th>Duration (s)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-row">No sessions found</td>
              </tr>
            ) : (
              filteredRows.map((r) => {
                const colors = getStatusStyle(r.protocol_status);
                
                return (
                  <tr key={r.session_id}>
                    <td>{r.session_id}</td>
                    <td className="highlighted">{r.participant_name || "—"}</td>
                    <td>{r.protocol_name}</td>
                    <td>{r.protocol_language || "—"}</td>
                    <td>{r.session_started_at || "—"}</td>
                    <td>{r.total_duration_seconds || "0"}</td>
                    <td>
                      <span 
                        className="status-badge" 
                        style={{ 
                          padding: "4px 10px", 
                          fontSize: "0.8rem",
                          backgroundColor: colors.bg,
                          color: colors.text
                        }}
                      >
                        {r.protocol_status}
                      </span>
                      
                      {/* Sub-labels for the new JSON boolean flags */}
                      <div style={{ fontSize: "0.75rem", marginTop: "6px", color: "var(--muted)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {r.was_resumed === 1 && <span>🔄 Was Resumed</span>}
                        {r.language_switched === 1 && <span>🌐 Lang. Switched</span>}
                      </div>
                    </td>
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