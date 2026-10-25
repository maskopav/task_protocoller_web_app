// src/components/ui/Tabs.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import "./ui.css";

/**
 * Tabs rendered as links (the active one follows the URL).
 * @param {Array<{to: string, label: string, count?: number, testId?: string, end?: boolean}>} items
 */
export function Tabs({ items = [], label }) {
  return (
    <nav className="ui-tabs" aria-label={label}>
      {items.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          data-testid={tab.testId}
          className={({ isActive }) => `ui-tab${isActive ? " ui-tab-active" : ""}`}
        >
          {tab.label}
          {tab.count != null && <span className="ui-tab-count">{tab.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
