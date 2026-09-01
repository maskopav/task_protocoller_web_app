// src/components/Fieldwork/FieldworkSummary.jsx
import React, { useMemo } from "react";
import { STATUS_META, STATUS_ORDER } from "./statusMeta";

// Doubles as a shortcut for the table's status column filter: clicking a
// card sets/clears `columnFilters.status` so the two stay in sync.
export default function FieldworkSummary({ rows, activeStatus, onSelectStatus }) {
  const statusCounts = useMemo(() => {
    const counts = { created: 0, in_progress: 0, incomplete: 0, finished: 0 };
    rows.forEach((r) => {
      if (counts[r.protocol_status] !== undefined) counts[r.protocol_status]++;
    });
    return counts;
  }, [rows]);

  return (
    <div className="fieldwork-summary">
      {STATUS_ORDER.map((key) => {
        const meta = STATUS_META[key];
        const active = activeStatus === key;
        return (
          <button
            key={key}
            type="button"
            className={`fieldwork-summary-card${active ? " is-active" : ""}`}
            onClick={() => onSelectStatus(active ? "" : key)}
            title={meta.hint}
            style={{ "--accent": meta.dot }}
          >
            <span className="fieldwork-summary-value">{statusCounts[key]}</span>
            <span className="fieldwork-summary-label">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
