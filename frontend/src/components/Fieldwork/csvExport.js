// src/components/Fieldwork/csvExport.js
import { timestampForFilename } from "./formatters";

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// Mirrors exactly what's on screen: same columns, same order, same
// currently-applied column filters/sort — `rows` and `columns` should be
// whatever the table is rendering at the moment of export.
export function exportFieldworkCsv(rows, columns) {
  const csvRows = [columns.map((col) => escapeCsv(col.label)).join(",")];

  rows.forEach((r) => {
    csvRows.push(columns.map((col) => escapeCsv(col.value(r))).join(","));
  });

  // Leading BOM so Excel (the common opener on Windows) detects UTF-8
  // instead of guessing Windows-1252 and mangling non-ASCII characters
  // like the "—" dash into "â€”".
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `fieldwork_export_${timestampForFilename()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
