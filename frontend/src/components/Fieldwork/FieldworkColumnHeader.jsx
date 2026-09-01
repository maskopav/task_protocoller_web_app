// src/components/Fieldwork/FieldworkColumnHeader.jsx
import React from "react";

function SortIndicator({ direction }) {
  if (!direction) return <span className="fieldwork-sort-icon fieldwork-sort-icon-idle">⇅</span>;
  return <span className="fieldwork-sort-icon fieldwork-sort-icon-active">{direction === "asc" ? "▲" : "▼"}</span>;
}

// A single <th>: sortable label on top, an inline filter control (text
// input or, for enum-like columns, a dropdown) underneath — so filtering
// and ordering both live next to the column they act on.
export default function FieldworkColumnHeader({ column, sortDirection, onSort, filterValue, onFilterChange }) {
  return (
    <th className="fieldwork-th">
      <button type="button" className="fieldwork-th-label" onClick={() => onSort(column.id)}>
        <span>{column.label}</span>
        <SortIndicator direction={sortDirection} />
      </button>
      {column.filterType === "select" ? (
        <select
          className="fieldwork-th-filter"
          value={filterValue || ""}
          onChange={(e) => onFilterChange(column.id, e.target.value)}
        >
          <option value="">All</option>
          {column.filterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className="fieldwork-th-filter"
          placeholder="Filter..."
          value={filterValue || ""}
          onChange={(e) => onFilterChange(column.id, e.target.value)}
        />
      )}
    </th>
  );
}
