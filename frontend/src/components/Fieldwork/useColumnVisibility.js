// src/components/Fieldwork/useColumnVisibility.js
import { useEffect, useMemo, useState } from "react";
import { COLUMN_DEFS } from "./columns.jsx";

const COLUMNS_STORAGE_KEY = "fieldworkTable.visibleColumns";

// Columns added after the original storage format (a bare array of visible
// ids) — that format didn't record which columns existed, so these are the
// ones a legacy save has never seen and should get their default visibility.
const COLUMNS_ADDED_AFTER_LEGACY_FORMAT = ["contactConsent"];

// Turns whatever is in storage into { visible, known }. `known` is every
// column id this viewer has ever been offered; a column not in it is new
// since their last save, so it starts at its `defaultVisible` instead of
// staying silently hidden behind their saved choices.
export function resolveColumnVisibility(stored, columnDefs) {
  const currentIds = columnDefs.map((c) => c.id);
  const defaults = columnDefs.filter((c) => c.defaultVisible !== false).map((c) => c.id);

  let visible;
  let known;
  if (Array.isArray(stored)) {
    visible = stored;
    known = currentIds.filter((id) => !COLUMNS_ADDED_AFTER_LEGACY_FORMAT.includes(id));
  } else if (stored && Array.isArray(stored.visible) && Array.isArray(stored.known)) {
    visible = stored.visible;
    known = stored.known;
  } else {
    return { visible: new Set(defaults), known: new Set(currentIds) };
  }

  const knownSet = new Set(known);
  const visibleSet = new Set(visible);
  for (const id of defaults) {
    if (!knownSet.has(id)) visibleSet.add(id);
  }
  // Union, not replace: a column hidden by a feature flag right now keeps
  // its saved choice for when it comes back.
  for (const id of currentIds) knownSet.add(id);
  return { visible: visibleSet, known: knownSet };
}

function loadColumnVisibility() {
  let stored = null;
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    // ignore malformed/unavailable storage — fall back to defaults
  }
  return resolveColumnVisibility(stored, COLUMN_DEFS);
}

export function useColumnVisibility() {
  const [{ visible: initialVisible, known: knownColumns }] = useState(loadColumnVisibility);
  const [visibleColumns, setVisibleColumns] = useState(initialVisible);

  useEffect(() => {
    try {
      localStorage.setItem(
        COLUMNS_STORAGE_KEY,
        JSON.stringify({ visible: [...visibleColumns], known: [...knownColumns] })
      );
    } catch {
      // per-viewer convenience only — safe to skip if storage is unavailable
    }
  }, [visibleColumns, knownColumns]);

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
