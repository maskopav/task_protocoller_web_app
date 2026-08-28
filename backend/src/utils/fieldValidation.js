// src/utils/fieldValidation.js
// Trust-boundary validation for the comma-separated free-text list columns
// (countries / contact_persons / contact_emails) and the site access token.
// The frontend duplicates these checks for UX only — req.body is reachable
// with curl and any valid admin JWT, so these are the ones that count.

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export const splitList = (v) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// The first offending entry, or null when the list is valid or empty.
// ponytail: format only — no MX lookup, no deliverability check. Add one if
// bounced study contacts ever become a real problem.
export const firstInvalidEmail = (v) =>
  splitList(v).find((e) => !EMAIL.test(e)) ?? null;

// Deliberately wider than the generator's 32-hex output: the seeded tokens
// ('paris000...') are alphanumeric but NOT hex, so a hex-only rule would make
// every seeded site unsavable. URL-safe charset because the token is a path
// segment in GET /site-config/:token. Lower bound 16 stops a master setting a
// guessable credential; upper bound 64 is the column width.
export const isValidAccessToken = (v) =>
  /^[A-Za-z0-9_-]{16,64}$/.test(String(v ?? ""));

// Blank or absent means "leave the stored value alone" — see updateSite.
export const normalizeToken = (input) => {
  const t = typeof input === "string" ? input.trim() : "";
  return t === "" ? null : t;
};

export const TOKEN_FORMAT_ERROR =
  "Access token must be 16-64 characters: letters, digits, _ or -";
