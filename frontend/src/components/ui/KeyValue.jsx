// src/components/ui/KeyValue.jsx
import React from "react";
import "./ui.css";

/**
 * @param {Array<{label: string, value: React.ReactNode, mono?: boolean}>} items  empty values are skipped unless `keepEmpty`
 * @param {1|2|4} [cols=4]
 */
export function KeyValue({ items = [], cols = 4, keepEmpty = false }) {
  const shown = items.filter((it) => keepEmpty || (it.value !== null && it.value !== undefined && it.value !== ""));
  return (
    <dl className={`ui-kv${cols !== 4 ? ` ui-kv-${cols}` : ""}`}>
      {shown.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd className={it.mono ? "ui-mono" : undefined}>{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
