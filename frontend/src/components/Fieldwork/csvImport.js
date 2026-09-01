// src/components/Fieldwork/csvImport.js
import { downloadCsv } from "./csvExport";
import { timestampForFilename } from "./formatters";

const ID_HEADERS = ["external_id", "id", "respondent_id", "participant_id"];
const DATE_HEADERS = ["sent_at", "link_sent_at", "date", "date_sent", "contacted_at"];

// Minimal RFC-4180-ish CSV line split (quoted fields, doubled-quote escapes)
// — mirrors the escaping csvExport.js writes, so round-tripping our own
// export/template files works, while still tolerating plain unquoted CSVs
// exported from Excel/Sheets.
function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// Parses a survey agency's "which respondent got their link when" CSV into
// { external_id, sent_at } rows. Header names are matched loosely (case-
// insensitive, a handful of common synonyms) since agencies don't all call
// the same column the same thing; the actual ID lookup and date-format
// validation happen server-side, where the participant data lives.
export function parseImportCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { rows: [], errors: ["The file is empty."] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idIdx = header.findIndex((h) => ID_HEADERS.includes(h));
  const dateIdx = header.findIndex((h) => DATE_HEADERS.includes(h));

  if (idIdx === -1 || dateIdx === -1) {
    return {
      rows: [],
      errors: [
        `Couldn't find both an ID column and a date column in the header row. Expected something like "external_id" and "sent_at" — use the template if unsure.`,
      ],
    };
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const external_id = cells[idIdx] || "";
    const sent_at = cells[dateIdx] || "";
    if (!external_id && !sent_at) continue;
    if (!external_id || !sent_at) {
      errors.push(`Row ${i + 1}: missing ${!external_id ? "ID" : "date"}, skipped.`);
      continue;
    }
    rows.push({ external_id, sent_at });
  }

  return { rows, errors };
}

export function downloadImportTemplate() {
  const template = ["external_id,sent_at", "P-001,2026-09-01 10:30:00", "P-002,2026-09-01 11:05:00"].join("\n");
  downloadCsv(`fieldwork_import_template_${timestampForFilename()}.csv`, template);
}
