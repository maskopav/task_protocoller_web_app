// src/utils/dateFormatter.js
function padTwoDigits(num) {
    return num.toString().padStart(2, "0");
  }

// Filename-safe UTC timestamp, e.g. "2026-08-31_13-38-47Z". The trailing
// "Z" marks it as UTC so nobody has to guess when browsing files on disk --
// every stored/machine-facing timestamp in this app is UTC; only the UI
// converts to local time for display.
export function dateInYyyyMmDdHhMmSs(date = new Date(), dateDivider = "-") {
return (
    [
    date.getUTCFullYear(),
    padTwoDigits(date.getUTCMonth() + 1),
    padTwoDigits(date.getUTCDate()),
    ].join(dateDivider) +
    "_" + // Changed space to underscore for safer filenames
    [
    padTwoDigits(date.getUTCHours()),
    padTwoDigits(date.getUTCMinutes()),
    padTwoDigits(date.getUTCSeconds()),
    ].join("-") + // Changed colon to dash for safer filenames
    "Z"
);
}

// --- Local time, for things admins read (exports, calendar dates) ---
// "Local" = this Node process's time zone: the host's, or the standard TZ
// env var (e.g. TZ=Europe/Prague) if the host runs in UTC. That must be the
// admins' own zone -- the same assumption booking-service's dateHelpers.js
// already makes for slot times, and both run in one process.

// Date -> "YYYY-MM-DD HH:MM:SS" in local time.
export function localDateTimeString(date) {
  return (
    `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())} ` +
    `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}:${padTwoDigits(date.getSeconds())}`
  );
}

// Today's (or the given instant's) local calendar date, "YYYY-MM-DD" --
// for DATE columns, which are calendar days as the admin sees them.
export function localDateString(date = new Date()) {
  return localDateTimeString(date).slice(0, 10);
}

// A UTC timestamp string from the DB ("YYYY-MM-DD HH:MM:SS[.fff]") ->
// the same instant as local "YYYY-MM-DD HH:MM:SS". Empty stays empty;
// anything unparseable is passed through untouched rather than dropped.
export function utcDbToLocal(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? value : localDateTimeString(date);
}
