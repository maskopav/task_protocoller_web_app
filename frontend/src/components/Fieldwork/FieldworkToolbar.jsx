// src/components/Fieldwork/FieldworkToolbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { COLUMN_DEFS } from "./columns.jsx";
import FieldworkImportModal from "./FieldworkImportModal";

// Search/status filtering lives per-column in the table header now (see
// FieldworkColumnHeader) — this toolbar just holds table-wide actions:
// column visibility, clearing filters/sort, import, and export.
export default function FieldworkToolbar({
  visibleColumns,
  onToggleColumn,
  hasActiveFilters,
  onClearFilters,
  onExportCsv,
  projectId,
  onImported,
}) {
  const columnsMenuRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);

  // Close the columns menu on outside click (native <details> only toggles on <summary>)
  useEffect(() => {
    function handleClickOutside(e) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target)) {
        columnsMenuRef.current.removeAttribute("open");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="fieldwork-toolbar">
      <div className="fieldwork-toolbar-actions">
        {hasActiveFilters && (
          <button type="button" className="fieldwork-clear-filters" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className="fieldwork-toolbar-actions">
        <details className="fieldwork-columns-menu" ref={columnsMenuRef}>
          <summary className="fieldwork-columns-btn">Columns</summary>
          <div className="fieldwork-columns-panel">
            {COLUMN_DEFS.map((col) => (
              <label key={col.id} className="fieldwork-columns-option">
                <input
                  type="checkbox"
                  checked={col.required || visibleColumns.has(col.id)}
                  disabled={col.required}
                  onChange={() => onToggleColumn(col.id)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </details>
        <button className="btn-edit" onClick={() => setImportOpen(true)}>
          Import
        </button>
        <button className="btn-edit" onClick={onExportCsv}>
          Export CSV
        </button>
      </div>

      <FieldworkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        projectId={projectId}
        onImported={onImported}
      />
    </div>
  );
}
