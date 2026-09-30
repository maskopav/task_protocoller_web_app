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
