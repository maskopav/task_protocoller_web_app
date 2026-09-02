// src/components/Fieldwork/formatters.js
import { STATUS_META } from "./statusMeta";

export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
// a dash as blank), timestamps are passed through as the DB's own
// "YYYY-MM-DD HH:MM:SS" (unambiguous, Excel parses it as a real date/time
// natively), and duration is H:MM:SS (Excel recognizes it as a time value —
// sortable, usable in SUM — instead of the "1h 17m" text).
export function csvDateTime(value) {
  return value || "";
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

// e.g. "2026-08-31_1432" — filesystem-safe, sorts chronologically, local time
export function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
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
