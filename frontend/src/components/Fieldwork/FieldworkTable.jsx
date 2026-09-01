// src/components/Fieldwork/FieldworkTable.jsx
import React from "react";
import "../Protocols/Protocols.css";
import "./FieldworkTable.css";
import FieldworkSummary from "./FieldworkSummary";
import FieldworkToolbar from "./FieldworkToolbar";
import FieldworkColumnHeader from "./FieldworkColumnHeader";
import { useColumnVisibility } from "./useColumnVisibility";
import { useFieldworkFilters } from "./useFieldworkFilters";
import { exportFieldworkCsv } from "./csvExport";

export default function FieldworkTable({ rows }) {
  const { visibleColumns, toggleColumn, activeColumns } = useColumnVisibility();
  const {
    columnFilters,
    setColumnFilter,
    clearFilters,
    sortConfig,
    toggleSort,
    hasActiveFilters,
    filteredSortedRows,
  } = useFieldworkFilters(rows, activeColumns);

  // Export mirrors exactly what's on screen: same columns, same order, same
  // currently-applied per-column filters and sort.
  const handleExportCSV = () => exportFieldworkCsv(filteredSortedRows, activeColumns);

  return (
    <div className="fieldwork-container">
      <FieldworkSummary
        rows={rows}
        activeStatus={columnFilters.status || ""}
        onSelectStatus={(status) => setColumnFilter("status", status)}
      />

      <FieldworkToolbar
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onExportCsv={handleExportCSV}
      />

      <div className="table-scroll-area fieldwork-scroll-area">
        <table className="table fieldwork-table">
          <thead>
            <tr>
              {activeColumns.map((col) => (
                <FieldworkColumnHeader
                  key={col.id}
                  column={col}
                  sortDirection={sortConfig.columnId === col.id ? sortConfig.direction : null}
                  onSort={toggleSort}
                  filterValue={columnFilters[col.id]}
                  onFilterChange={setColumnFilter}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSortedRows.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} className="empty-row">No sessions found</td>
              </tr>
            ) : (
              filteredSortedRows.map((r) => (
                <tr key={r.session_id ?? `pp-${r.participant_protocol_id}`}>
                  {activeColumns.map((col) => (
                    <td key={col.id}>{col.render(r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
