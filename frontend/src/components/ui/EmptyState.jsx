// src/components/ui/EmptyState.jsx
import React from "react";
import { Icon } from "./icons.jsx";
import "./ui.css";

/** @param {string} [icon] @param {React.ReactNode} title @param {React.ReactNode} [description] @param {React.ReactNode} [action] */
export function EmptyState({ icon = "inbox", title, description, action, ...rest }) {
  return (
    <div className="ui-empty" {...rest}>
      <div className="ui-empty-icon"><Icon name={icon} size={22} /></div>
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
