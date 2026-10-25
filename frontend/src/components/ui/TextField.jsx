// src/components/ui/TextField.jsx
import React, { useId } from "react";
import "./ui.css";

/** Labelled input (or textarea with `multiline`). @param {string} label @param {string} [help] @param {string} [error] */
export function TextField({ label, help, error, multiline = false, id, className = "", type = "text", ...props }) {
  const auto = useId();
  const fid = id || auto;
  const describedBy = error ? `${fid}-err` : help ? `${fid}-help` : undefined;
  const common = { id: fid, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, ...props };
  return (
    <div className={`ui-field${error ? " ui-field-invalid" : ""} ${className}`.trim()}>
      <label htmlFor={fid}>{label}</label>
      {multiline ? <textarea rows={4} {...common} /> : <input type={type} {...common} />}
      {error ? <span id={`${fid}-err`} className="ui-field-error">{error}</span>
        : help ? <span id={`${fid}-help`} className="ui-field-help">{help}</span> : null}
    </div>
  );
}
