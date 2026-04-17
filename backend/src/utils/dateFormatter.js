// src/utils/dateFormatter.js
function padTwoDigits(num) {
    return num.toString().padStart(2, "0");
  }
  
// Added default value "new Date()" to the argument
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
    ].join("-") // Changed colon to dash for safer filenames
);
}