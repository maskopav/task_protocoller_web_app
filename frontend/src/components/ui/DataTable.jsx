// src/components/ui/DataTable.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "./EmptyState.jsx";
import "./ui.css";

const INTERACTIVE = "a,button,input,select,textarea,label,[role='menu'],[role='menuitem']";

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * @param {Array<{key: string, header: React.ReactNode, render?: (row) => React.ReactNode,
 *   align?: 'num'|'end', wrap?: boolean, primary?: boolean, sortable?: boolean,
 *   sortValue?: (row) => any}>} columns
 * @param {Array<object>} rows
 * @param {string|((row) => string|number)} [rowKey='id']
 * @param {(row) => void} [onRowClick]  makes rows clickable (keyboard: Enter/Space)
 * @param {(row) => string} [href]      router path (e.g. "/studies/3"); makes rows clickable
 * @param {React.ReactNode} [empty]     shown instead of the table when rows is empty (default EmptyState)
 * @param {{key: string, dir: 'asc'|'desc'}} [defaultSort]
 * Rows with controls (buttons, links, Menu) keep working: clicks on them do not trigger the row.
 */
export function DataTable({ columns, rows = [], rowKey = "id", onRowClick, href, empty, defaultSort, caption, ...rest }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState(defaultSort || null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.sortValue || ((r) => r[col.key]);
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((x, y) => dir * compare(val(x), val(y)));
  }, [rows, sort, columns]);

  if (rows.length === 0) return empty ?? <EmptyState title="—" />;

  const getKey = typeof rowKey === "function" ? rowKey : (r) => r[rowKey];
  const clickable = !!(onRowClick || href);
  const activate = (row) => {
    if (onRowClick) onRowClick(row);
    else if (href) navigate(href(row));
  };
  const toggleSort = (key) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="ui-tbl-wrap">
      <table className="ui-tbl" {...rest}>
        {caption && <caption className="ui-sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.align ? `ui-tbl-${c.align}` : undefined}
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {c.sortable ? (
                  <button type="button" className="ui-tbl-sort" onClick={() => toggleSort(c.key)}>
                    {c.header}
                    <span className="ui-tbl-arrow" aria-hidden="true">
                      {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getKey(row)}
              className={clickable ? "ui-tbl-click" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? (e) => { if (!e.target.closest(INTERACTIVE)) activate(row); } : undefined}
              onKeyDown={clickable ? (e) => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); activate(row); }
              } : undefined}
            >
              {columns.map((c) => {
                const cls = [c.align && `ui-tbl-${c.align}`, c.wrap && "ui-tbl-wrap-cell", c.primary && "ui-tbl-primary"].filter(Boolean).join(" ");
                const content = c.render ? c.render(row) : row[c.key];
                return <td key={c.key} className={cls || undefined}>{content ?? ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
