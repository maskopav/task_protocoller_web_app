// src/utils/formatDate.js
// Date helpers that follow the UI language (i18next) through Intl.
// Invalid or missing input returns "" so callers never print "Invalid Date" or raw ISO.
import i18n from "i18next";

// The API sends DB datetimes as UTC. A zoneless "YYYY-MM-DD HH:MM:SS" (or with "T") would
// otherwise be read as browser-local time and shift by the UTC offset.
const ZONELESS = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let v = value;
  if (typeof v === "string" && ZONELESS.test(v.trim())) v = `${v.trim().replace(" ", "T")}Z`;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function locale(explicit) {
  return explicit || i18n.language || "en";
}

/** "12 Mar 2026" */
export function formatShortDate(value, loc) {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(locale(loc), { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** "12 Mar 2026, 14:05" */
export function formatDateTime(value, loc) {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(locale(loc), {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "5 minutes ago", "yesterday". Falls back to the short date beyond about 30 days. `now` is injectable for tests. */
export function formatRelative(value, loc, now = Date.now()) {
  const d = toDate(value);
  if (!d) return "";
  const diffSec = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale(loc), { numeric: "auto" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs >= 30 * 24 * 3600) return formatShortDate(d, loc);
  for (const [unit, secs] of UNITS) {
    if (unit === "year" || unit === "month") continue; // older than ~30 days reads better as a date
    if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return formatShortDate(d, loc);
}
