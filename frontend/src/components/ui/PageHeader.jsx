// src/components/ui/PageHeader.jsx
import React from "react";
import { Breadcrumbs } from "./Breadcrumbs.jsx";
import "./ui.css";

/**
 * @param {Array<{label: string, to?: string}>} [breadcrumbs]
 * @param {React.ReactNode} title
 * @param {React.ReactNode} [badges] rendered next to the title
 * @param {React.ReactNode} [sub] line under the title
 * @param {React.ReactNode} [actions] right-aligned; at most one primary Button (caller's job)
 */
export function PageHeader({ breadcrumbs, title, badges, sub, actions }) {
  return (
    <header>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="ui-page-head">
        <div className="ui-page-head-main">
          <div className="ui-page-head-title">
            <h1>{title}</h1>
            {badges}
          </div>
          {sub && <div className="ui-page-head-sub">{sub}</div>}
        </div>
        {actions && <div className="ui-page-head-actions">{actions}</div>}
      </div>
    </header>
  );
}
