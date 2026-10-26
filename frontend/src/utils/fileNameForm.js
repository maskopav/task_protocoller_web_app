// src/utils/fileNameForm.js
// The clinic name as the desktop app writes it into file names (spec §3, F-008).
// Mirrors the desktop rule (PatientFieldCatalogue.sanitize): strip accents, then drop everything outside
// [A-Za-z0-9_-]. The server never builds file names from the clinic name; this is only a hint in the forms.
export function fileNameForm(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "");
}
