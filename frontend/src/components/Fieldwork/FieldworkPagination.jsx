// src/components/Fieldwork/FieldworkPagination.jsx
import React from "react";
import { PAGE_SIZE_OPTIONS } from "./usePagination";

export default function FieldworkPagination({
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPageChange,
  totalRows,
}) {
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * (pageSize === "all" ? totalRows : pageSize) + 1;
  const rangeEnd = pageSize === "all" ? totalRows : Math.min(currentPage * pageSize, totalRows);

  return (
    <div className="fieldwork-pagination">
      <label className="fieldwork-page-size">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSizeChange(e.target.value)}>
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All" : opt}
            </option>
          ))}
        </select>
      </label>

      <span className="fieldwork-page-range">
        {totalRows === 0 ? "0 of 0" : `${rangeStart}–${rangeEnd} of ${totalRows}`}
      </span>

      <div className="fieldwork-page-nav">
        <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          ‹ Prev
        </button>
        <span className="fieldwork-page-indicator">
          Page {currentPage} of {totalPages}
        </span>
        <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}
