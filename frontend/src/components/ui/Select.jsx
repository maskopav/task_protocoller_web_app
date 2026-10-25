// src/components/ui/Select.jsx
import React, { useId } from "react";
import "./ui.css";

/** Labelled select. Give `options` as [{value, label}] or pass <option> children. */
export function Select({ label, help, error, options, id, className = "", children, ...props }) {
  const auto = useId();
  const fid = id || auto;
  const describedBy = error ? `${fid}-err` : help ? `${fid}-help` : undefined;
  return (
    <div className={`ui-field${error ? " ui-field-invalid" : ""} ${className}`.trim()}>
      {label && <label htmlFor={fid}>{label}</label>}
      <select id={fid} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...props}>
        {options ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : children}
      </select>
      {error ? <span id={`${fid}-err`} className="ui-field-error">{error}</span>
        : help ? <span id={`${fid}-help`} className="ui-field-help">{help}</span> : null}
    </div>
  );
}
