// src/components/ui/StatusDot.jsx
import React from "react";
import "./ui.css";

/** Coloured dot + label. @param {'idle'|'ok'|'warn'|'bad'|'accent'} [tone='idle'] */
export function StatusDot({ tone = "idle", children, className = "", ...rest }) {
  const cls = ["ui-status", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      <span className={`ui-dot${tone !== "idle" ? ` ui-dot-${tone}` : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}
