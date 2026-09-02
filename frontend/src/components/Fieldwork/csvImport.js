// src/components/Fieldwork/csvImport.js
import { downloadCsv } from "./csvExport";
import { timestampForFilename } from "./formatters";

const ID_HEADERS = ["external_id", "id", "respondent_id", "participant_id"];
const DATE_HEADERS = ["contacted_at", "sent_at", "link_sent_at", "date", "date_sent", "call_date", "date_called"];
const NOTES_HEADERS = ["notes", "note", "call_notes", "comment", "comments"];

// Accepted date/time formats, kept in sync with the backend's own validation
// (participantProtocolController.js's normalizeDateTime): a bare date, or a
// date plus a 24-hour time, space- or "T"-separated, with or without
// seconds. Deliberately year-first (ISO-style) only — DD/MM vs MM/DD is
// genuinely ambiguous across locales, and a silently-wrong date is worse
// than a rejected row.
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

export const DATE_FORMAT_HELP =
  'Dates must start with the year: "YYYY-MM-DD", optionally followed by a 24-hour time. ' +
  "Accepted examples: 2026-09-01  ·  2026-09-01 14:30  ·  2026-09-01 14:30:00  ·  2026-09-01T14:30:00. " +
  "Don't use DD/MM/YYYY or MM/DD/YYYY — that ordering is ambiguous and will be rejected.";

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

// Parses a survey agency's outreach CSV into { external_id, contacted_at }
// rows (plus `notes` when `withNotes` is set, for call-log imports). Header
// names are matched loosely (case-insensitive, a handful of common synonyms)
// since agencies don't all call the same column the same thing. Dates are
// validated here too (not just server-side) so a malformed file is flagged
// immediately, with the exact expected format, instead of round-tripping to
// the server first.
export function parseImportCsv(text, { withNotes = false } = {}) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { rows: [], errors: ["The file is empty."] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idIdx = header.findIndex((h) => ID_HEADERS.includes(h));
  const dateIdx = header.findIndex((h) => DATE_HEADERS.includes(h));
  const notesIdx = withNotes ? header.findIndex((h) => NOTES_HEADERS.includes(h)) : -1;

  if (idIdx === -1 || dateIdx === -1) {
    return {
      rows: [],
      errors: [
        `Couldn't find both an ID column and a date column in the header row. Expected something like "external_id" and "contacted_at" — use the template if unsure.`,
      ],
    };
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const external_id = cells[idIdx] || "";
    const contacted_at = cells[dateIdx] || "";
    const notes = notesIdx !== -1 ? cells[notesIdx] || "" : "";

    if (!external_id && !contacted_at) continue;
    if (!external_id || !contacted_at) {
      errors.push(`Row ${i + 1}: missing ${!external_id ? "ID" : "date"}, skipped.`);
      continue;
    }
    if (!DATE_RE.test(contacted_at)) {
      errors.push(`Row ${i + 1}: "${contacted_at}" isn't a recognized date format, skipped. ${DATE_FORMAT_HELP}`);
      continue;
    }

    rows.push(withNotes ? { external_id, contacted_at, notes } : { external_id, contacted_at });
  }

  return { rows, errors };
}

// Demonstrates the accepted date formats directly in the sample rows, so
// the template doubles as a live example rather than just a column header.
export function downloadImportTemplate(contactType) {
  const withNotes = contactType === "call";
  const header = withNotes ? "external_id,contacted_at,notes" : "external_id,contacted_at";
  const sampleRows = withNotes
    ? ["P-001,2026-09-01 10:30,No answer", "P-002,2026-09-01T14:05:00,Left voicemail", "P-003,2026-09-02,Rescheduled for next week"]
    : ["P-001,2026-09-01 10:30:00", "P-002,2026-09-01T14:05:00", "P-003,2026-09-02"];

  downloadCsv(`fieldwork_import_template_${contactType}_${timestampForFilename()}.csv`, [header, ...sampleRows].join("\n"));
}
