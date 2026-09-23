// backend/src/utils/csvParser.js
// Minimal parser for the one-column CSV the bulk participant import accepts
// (a list of external_id values, with an optional header row). Deliberately
// not a general CSV parser -- no support for multi-column rows or embedded
// newlines -- since that's the only shape this ever reads. Pairs with
// csvBuilder.js, which serializes the result CSV going the other way.

const HEADER_RE = /^external_id$/i;

function firstColumn(line) {
  const raw = line.split(",")[0].trim();
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/""/g, '"');
  }
  return raw;
}

// Returns the external_id values in file order, including blank/duplicate
// entries as-is -- the caller decides how to report those per row.
export function parseExternalIdsCsv(buffer) {
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");

  if (lines.length > 0 && HEADER_RE.test(firstColumn(lines[0]))) {
    lines.shift();
  }

  return lines.map(firstColumn);
}
