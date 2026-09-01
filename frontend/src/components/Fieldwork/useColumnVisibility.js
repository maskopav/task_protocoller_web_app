// src/components/Fieldwork/useColumnVisibility.js
import { useEffect, useMemo, useState } from "react";
import { COLUMN_DEFS, DEFAULT_VISIBLE_COLUMNS } from "./columns.jsx";

const COLUMNS_STORAGE_KEY = "fieldworkTable.visibleColumns";

function loadVisibleColumns() {
  try {
    const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {
    // ignore malformed/unavailable storage — fall back to defaults
  }
  return new Set(DEFAULT_VISIBLE_COLUMNS);
}

export function useColumnVisibility() {
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visibleColumns]));
    } catch {
      // per-viewer convenience only — safe to skip if storage is unavailable
    }
  }, [visibleColumns]);

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeColumns = useMemo(
    () => COLUMN_DEFS.filter((c) => c.required || visibleColumns.has(c.id)),
    [visibleColumns]
  );

  return { visibleColumns, toggleColumn, activeColumns };
}
