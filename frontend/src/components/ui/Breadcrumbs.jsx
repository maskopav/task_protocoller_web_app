// src/components/ui/Breadcrumbs.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "./icons.jsx";
import "./ui.css";

/** @param {Array<{label: string, to?: string}>} items  the last item (or any without `to`) is plain text */
export function Breadcrumbs({ items = [] }) {
  return (
    <nav className="ui-crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${i}-${item.label}`}>
            {item.to && !last ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span aria-current={last ? "page" : undefined}>{item.label}</span>
            )}
            {!last && <span className="ui-crumbs-sep"><Icon name="chevron" size={12} /></span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
