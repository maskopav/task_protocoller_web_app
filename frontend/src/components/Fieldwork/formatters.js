// src/components/Fieldwork/formatters.js
import { STATUS_META } from "./statusMeta";

export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const pad2 = (n) => String(n).padStart(2, "0");

const DISPLAY_OPTIONS = {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

// Two kinds of DB datetime reach this table, and they must not be mixed up:
//  - UTC instants (session_started_at, session_last_activity_at,
//    resumable_until, ...) -- every timestamp the app itself stores.
//    Converted to the viewer's local time for display.
//  - Wall-clock times (link_sent_at, call_N_at = participant_protocol_contacts
//    .contacted_at) -- typed in by the agency in their own local time via the
//    CSV import and stored as-is. Shown exactly as entered.
function parseUtc(value) {
  return new Date(value.replace(" ", "T") + "Z");
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = parseUtc(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, DISPLAY_OPTIONS);
}

export function formatWallClockDateTime(value) {
  if (!value) return "—";
  // No "Z": parsed as local, then displayed as local -- the wall-clock
  // digits come out unchanged, just in the same display format as above.
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, DISPLAY_OPTIONS);
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// --- CSV-specific formatters: Excel-friendly rather than human-friendly.
// Empty cells stay truly empty (no "—" placeholder — Excel can't sort/filter
// a dash as blank), timestamps are "YYYY-MM-DD HH:MM:SS" (Excel parses it
// as a real date/time natively), and duration is H:MM:SS (Excel recognizes
// it as a time value — sortable, usable in SUM — instead of the "1h 17m"
// text). Every CSV timestamp comes out in the exporter's local time, same as
// on screen, so the columns are comparable with each other.

// Wall-clock values (link_sent_at, call_N_at) — already local, passed
// through untouched so they round-trip through the CSV import unchanged.
export function csvDateTime(value) {
  return value || "";
}

// UTC instants — converted to the exporter's local time.
export function csvUtcDateTime(value) {
  if (!value) return "";
  const d = parseUtc(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function csvDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

// e.g. "2026-08-31_14-32-05Z" — filesystem-safe, sorts chronologically,
// UTC (the trailing "Z"), same format as the backend's filenames.
export function timestampForFilename(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}_${pad2(d.getUTCHours())}-${pad2(d.getUTCMinutes())}-${pad2(d.getUTCSeconds())}Z`;
}

const ORDINALS = ["1st", "2nd", "3rd"];
function ordinal(n) {
  return ORDINALS[n - 1] || `${n}th`;
}

// error_type values logged by MicCheck.jsx (utils/audioAnalysis.js)
const MIC_ERROR_LABELS = {
  muted: "No sound",
  "too-much-noise": "Background noise",
  "processing-error": "Processing error",
};

export function formatMicCheck(r, emptyText = "—") {
  if (!r.mic_check_attempts) return emptyText;
  if (r.mic_check_pass_attempt) {
    return `Passed (${ordinal(r.mic_check_pass_attempt)})`;
  }
  const errorLabel = MIC_ERROR_LABELS[r.mic_check_last_error] || r.mic_check_last_error || "Unknown error";
  return `Failed: ${errorLabel} (${r.mic_check_attempts}x)`;
}

export function statusValue(r) {
  const meta = STATUS_META[r.protocol_status] || STATUS_META.created;
  const parts = [meta.label];
  if (r.was_resumed === 1) parts.push("Resumed");
  if (r.language_switched === 1) parts.push("Lang. switched");
  return parts.join(" | ");
}

// The resume deadline only means anything while it's still live (in_progress)
// or just expired (incomplete) — for 'created'/'finished' there's no window
// to speak of, so the column stays blank there.
export function isResumeRelevant(r) {
  return r.protocol_status === "in_progress" || r.protocol_status === "incomplete";
}

// "in 2d" / "in 5h" / "in 20m" for a still-open window — gives admins a
// scannable sense of urgency without doing date math in their head.
export function formatRelative(deadlineStr) {
  const deadline = new Date(deadlineStr.replace(" ", "T") + "Z");
  const diffHours = (deadline.getTime() - Date.now()) / 3_600_000;
  if (diffHours <= 0) return "expired";
  if (diffHours < 1) return `in ${Math.round(diffHours * 60)}m`;
  if (diffHours < 48) return `in ${Math.round(diffHours)}h`;
  return `in ${Math.round(diffHours / 24)}d`;
}
