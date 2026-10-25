// src/components/ui/Switch.jsx
import React from "react";
import "./ui.css";

/** Controlled toggle. `label` is the accessible name (visible next to it unless `hideLabel`). */
export function Switch({ checked, onChange, label, hideLabel = false, disabled = false, ...rest }) {
  return (
    <label className="ui-switch">
      <span className="ui-switch-track">
        <input
          type="checkbox"
          role="switch"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked, e)}
          aria-label={hideLabel ? label : undefined}
          {...rest}
        />
        <span className="ui-switch-knob" />
      </span>
      {label && !hideLabel && <span>{label}</span>}
    </label>
  );
}
