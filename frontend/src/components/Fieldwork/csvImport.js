// src/components/Fieldwork/csvImport.js
import { downloadCsv } from "./csvExport";
import { timestampForFilename } from "./formatters";

// Every optional touchpoint column the importer understands — matches
// participant_protocol_contacts' (contact_type, attempt_number) 1:1. The
// admin picks a subset to import each time; external_id is always required
// and isn't part of this list. Sample values here double as the template's
// example row.
export const IMPORT_COLUMNS = [
  { key: "link_sent_at", label: "Link Sent", isDate: true, sample: "2026-09-01 10:30" },
  { key: "call_1_at", label: "Call 1 Date", isDate: true, sample: "2026-09-03 09:00" },
  { key: "call_1_notes", label: "Call 1 Notes", isDate: false, sample: "No answer" },
  { key: "call_2_at", label: "Call 2 Date", isDate: true, sample: "2026-09-05 09:00" },
  { key: "call_2_notes", label: "Call 2 Notes", isDate: false, sample: "Left voicemail" },
  { key: "call_3_at", label: "Call 3 Date", isDate: true, sample: "" },
  { key: "call_3_notes", label: "Call 3 Notes", isDate: false, sample: "" },
];

// A bare date or a date + 24h time, e.g. "2026-09-01" or "2026-09-01 14:30".
// Kept in sync with the backend's normalizeDateTime.
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

// Not a touchpoint to store — a disambiguation key (protocols.id, visible as
// the "Protocol ID" Fieldwork column) used only to resolve which of a
// respondent's active assignments a row applies to when they have more than
// one. Kept separate from IMPORT_COLUMNS since it's never written to
// participant_protocol_contacts itself.
export const PROTOCOL_ID_COLUMN = { key: "protocol_id", label: "Protocol ID" };

function splitCsvLine(line, delimiter) {
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
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const PROTOCOL_ID_RE = /^\d+$/;

// Parses an outreach CSV: one row per respondent, columns found by exact
// name (case-insensitive) rather than position — so any subset of
// `columns`, in any order, works as long as the header matches exactly.
// Only external_id is required per row; blank cells just mean "nothing to
// import for that touchpoint". `includeProtocolId` additionally looks for
// the protocol_id disambiguation column (see PROTOCOL_ID_COLUMN).
export function parseImportCsv(text, { columns, delimiter = ",", includeProtocolId = false }) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { rows: [], errors: ["The file is empty."] };
  }

  const header = splitCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const idIdx = header.indexOf("external_id");
  if (idIdx === -1) {
    return { rows: [], errors: [`Missing "external_id" column — check the delimiter and column names.`] };
  }
  const protocolIdIdx = includeProtocolId ? header.indexOf(PROTOCOL_ID_COLUMN.key) : -1;
  const colIdx = Object.fromEntries(columns.map((c) => [c.key, header.indexOf(c.key)]));

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const external_id = cells[idIdx] || "";
    if (!external_id) continue;

    const row = { external_id };

    if (protocolIdIdx !== -1) {
      const value = cells[protocolIdIdx] || "";
      if (value && !PROTOCOL_ID_RE.test(value)) {
        errors.push(`Row ${i + 1}: "${value}" in protocol_id isn't a whole number, that column was skipped.`);
      } else if (value) {
        row.protocol_id = value;
      }
    }

    for (const col of columns) {
      if (colIdx[col.key] === -1) continue;
      const value = cells[colIdx[col.key]] || "";
      if (col.isDate && value && !DATE_RE.test(value)) {
        errors.push(`Row ${i + 1}: "${value}" in ${col.key} isn't a recognized date, that column was skipped.`);
        continue;
      }
      row[col.key] = value;
    }
    rows.push(row);
  }

  return { rows, errors };
}

export function downloadImportTemplate(columns, delimiter = ",", includeProtocolId = false) {
  const header = ["external_id", ...(includeProtocolId ? [PROTOCOL_ID_COLUMN.key] : []), ...columns.map((c) => c.key)];
  const sampleRow = (id, protocolId) =>
    [id, ...(includeProtocolId ? [protocolId] : []), ...columns.map((c) => c.sample)].join(delimiter);

  const csv = [header.join(delimiter), sampleRow("P-001", "12"), sampleRow("P-002", "12")].join("\n");
  downloadCsv(`fieldwork_import_template_${timestampForFilename()}.csv`, csv);
}
