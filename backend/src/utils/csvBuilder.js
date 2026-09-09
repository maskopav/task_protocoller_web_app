// backend/src/utils/csvBuilder.js
// Minimal CSV serializer shared by export features. Every value is quoted
// and internal quotes doubled, so commas/newlines inside JSON payloads or
// free-text notes can never break column alignment.

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(","));
  }
  // Leading BOM so Excel (the common opener on Windows) detects UTF-8
  // instead of guessing a legacy codepage and mangling non-ASCII characters
  // in participant names/notes.
  const BOM = String.fromCharCode(0xfeff);
  return BOM + lines.join("\r\n");
}

// A JSON/JS value (DB JSON columns can come back already-parsed or as a raw
// string depending on driver/column) normalized to a single-line JSON
// string for embedding in a CSV cell.
export function jsonCellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
