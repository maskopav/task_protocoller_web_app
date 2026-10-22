// src/upload/csv.js — minimal CSV writer for the bundle's sessions.csv.
// Values that a spreadsheet would read as a formula (= + - @, also after a tab
// or CR) get a leading apostrophe; fields with , " CR LF are quoted.

export function csvCell(value) {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {string[]} header @param {Array<Array<unknown>>} rows  -> CSV text, CRLF line ends */
export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
