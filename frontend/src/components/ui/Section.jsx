// src/components/ui/Section.jsx
import React from "react";
import "./ui.css";

/** @param {React.ReactNode} title @param {React.ReactNode} [hint] @param {React.ReactNode} [actions] */
export function Section({ title, hint, actions, children, className = "", ...rest }) {
  return (
    <section className={`ui-section ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <div className="ui-section-head">
          {title && <h2>{title}</h2>}
          {hint && <span className="ui-section-hint">{hint}</span>}
          {actions && <div className="ui-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
