// src/components/Fieldwork/usePagination.js
import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, "all"];
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_STORAGE_KEY = "fieldworkTable.pageSize";

function loadPageSize() {
  try {
    const stored = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    if (stored === "all") return "all";
    const parsed = Number(stored);
    if (PAGE_SIZE_OPTIONS.includes(parsed)) return parsed;
  } catch {
    // ignore malformed/unavailable storage — fall back to the default
  }
  return DEFAULT_PAGE_SIZE;
}

// Pages the already filtered + sorted rows shown on screen. Export
// deliberately ignores this — it always writes the full filtered/sorted set,
// not just the current page.
export function usePagination(rows) {
  const [pageSize, setPageSizeState] = useState(loadPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      // per-viewer convenience only — safe to skip if storage is unavailable
    }
  }, [pageSize]);

  const setPageSize = (value) => {
    setPageSizeState(value === "all" ? "all" : Number(value));
    setCurrentPage(1);
  };

  const pagedRows = useMemo(() => {
    if (pageSize === "all") return rows;
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, pageSize, currentPage]);

  return {
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage: (page) => setCurrentPage(Math.min(Math.max(1, page), totalPages)),
    totalPages,
    pagedRows,
    totalRows: rows.length,
  };
}
