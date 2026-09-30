// src/utils/dateTime.js
// The DB stores every timestamp in UTC ("YYYY-MM-DD HH:MM:SS", no zone
// marker); admins read everything in their own local time. These helpers
// do that conversion. Two kinds of DB value must not be mixed up:
//  - UTC timestamps (created_at, start_date, session_date, ...) -> convert.
//  - DATE columns (birth_date, projects.start_date/end_date) and naive
//    wall-clock values (slot times, agency contact times) -> already local,
//    show as-is.

const pad2 = (n) => String(n).padStart(2, "0");

// "YYYY-MM-DD" of a Date in local time.
export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// UTC DB timestamp -> Date (or null when empty/unparseable).
export function parseUtcDbDateTime(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

// UTC DB timestamp -> local calendar day "YYYY-MM-DD" ("" when empty).
// Replaces value.slice(0, 10), which gives the UTC day -- "yesterday" for
// anything saved just after local midnight.
export function formatUtcDbDate(value) {
  const date = parseUtcDbDateTime(value);
  return date ? localDateString(date) : value || "";
}

// DATE column ("YYYY-MM-DD") -> locale-formatted date, without the
// new Date("YYYY-MM-DD") trap (parsed as UTC midnight, so it shows the
// previous day anywhere west of UTC).
export function formatCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return value || "";
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
}
