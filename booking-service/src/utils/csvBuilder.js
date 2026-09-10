// src/utils/csvBuilder.js — same convention as
// task_protocoller_web_app/backend/src/utils/csvBuilder.js.
function escapeCsvValue(value) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(","));
  }
  const BOM = String.fromCharCode(0xfeff);
  return BOM + lines.join("\r\n");
}
