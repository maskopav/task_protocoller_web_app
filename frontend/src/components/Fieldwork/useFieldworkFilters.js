// src/components/Fieldwork/useFieldworkFilters.js
import { useMemo, useState } from "react";

function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matchesFilter(column, row, rawFilter) {
  if (!rawFilter) return true;
  const getFilterValue = column.filterValue || column.value;
  const value = getFilterValue(row);
  if (column.filterType === "select") return String(value) === rawFilter;
  return String(value ?? "").toLowerCase().includes(rawFilter.toLowerCase());
}

// Per-column filters (`{ [columnId]: rawFilterString }`) and a single active
// sort column, applied together against whatever columns are currently
// visible — so hiding a column also drops its filter, and CSV export can
// reuse the exact same filtered + sorted rows shown on screen.
export function useFieldworkFilters(rows, columns) {
  const [columnFilters, setColumnFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ columnId: null, direction: "asc" });

  const setColumnFilter = (columnId, rawFilter) => {
    setColumnFilters((prev) => ({ ...prev, [columnId]: rawFilter }));
  };

  const clearFilters = () => {
    setColumnFilters({});
    setSortConfig({ columnId: null, direction: "asc" });
  };

  const toggleSort = (columnId) => {
    setSortConfig((prev) => {
      if (prev.columnId !== columnId) return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      return { columnId: null, direction: "asc" };
    });
  };

  const activeFilters = useMemo(
    () => Object.fromEntries(Object.entries(columnFilters).filter(([id, v]) => v && columns.some((c) => c.id === id))),
    [columnFilters, columns]
  );

  const hasActiveFilters = Object.keys(activeFilters).length > 0 || sortConfig.columnId !== null;

  const filteredSortedRows = useMemo(() => {
    let result = rows.filter((row) =>
      columns.every((col) => matchesFilter(col, row, activeFilters[col.id]))
    );

    if (sortConfig.columnId) {
      const sortColumn = columns.find((c) => c.id === sortConfig.columnId);
      if (sortColumn) {
        const getSortValue = sortColumn.sortValue || sortColumn.value;
        const dir = sortConfig.direction === "desc" ? -1 : 1;
        result = [...result].sort((a, b) => dir * compareValues(getSortValue(a), getSortValue(b)));
      }
    }

    return result;
  }, [rows, columns, activeFilters, sortConfig]);

  return {
    columnFilters,
    setColumnFilter,
    clearFilters,
    sortConfig,
    toggleSort,
    hasActiveFilters,
    filteredSortedRows,
  };
}
