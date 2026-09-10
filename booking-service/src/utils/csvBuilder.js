// src/utils/csvBuilder.js — same convention as
// task_protocoller_web_app/backend/src/utils/csvBuilder.js.
function escapeCsvValue(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  // Formula-injection guard: some spreadsheet apps (Excel, older Sheets/
  // LibreOffice) execute a cell as a formula if it starts with =, +, -, @,
  // tab, or CR. Exported rows here (bookings) come straight from
  // unauthenticated public POST /public/bookings input (email/phone), so a
  // respondent could otherwise plant a formula an admin's spreadsheet app
  // runs on open. A leading apostrophe forces text interpretation.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(","));
  }
  const BOM = String.fromCharCode(0xfeff);
  return BOM + lines.join("\r\n");
}
