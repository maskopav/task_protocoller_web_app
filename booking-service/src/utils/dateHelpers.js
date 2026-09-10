// src/utils/dateHelpers.js — pure calendar/time math, kept separate from
// DB/HTTP code specifically so it's cheaply unit-testable (see
// dateHelpers.test.js). Nothing here does I/O.
//
// UTC-based Date objects below are used purely as a day-counter/calendar
// calculator, never as a real timezone or instant — a slot's starts_at is
// the room's own local wall-clock time (see googleCalendarService.js's
// CALENDAR_TIMEZONE note and README's "known v1 simplifications").

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// Yields "YYYY-MM-DD" for every date from startDate to endDate, inclusive.
export function* iterateDates(startDate, endDate) {
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
}

// 0=Sun..6=Sat, matching Date.getDay()/getUTCDay() convention.
export function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// "HH:MM" + minutes -> "HH:MM", or null if it would spill past midnight
// (slots never cross midnight in this model).
export function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// Pragmatic assumption for the pilot: slots are stored as naive local
// wall-clock time and this service is deployed in the same timezone as the
// resource being booked, so plain Date parsing of "YYYY-MM-DD HH:MM:SS" is
// correct. Revisit with an explicit per-resource IANA zone if this service
// is ever used across timezones.
export function isPastCutoff(mysqlDateTime, cutoffHoursBefore = 24, now = new Date()) {
  const slotDate = new Date(mysqlDateTime.replace(" ", "T"));
  const cutoff = new Date(slotDate.getTime() - cutoffHoursBefore * 60 * 60 * 1000);
  return now > cutoff;
}
