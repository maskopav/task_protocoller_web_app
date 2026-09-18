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
  /^[A-Za-z0-9_-]{8,64}$/.test(String(v ?? ""));

// Blank or absent means "leave the stored value alone" — see updateSite.
export const normalizeToken = (input) => {
  const t = typeof input === "string" ? input.trim() : "";
  return t === "" ? null : t;
};

export const TOKEN_FORMAT_ERROR =
  "Access token must be 8-64 characters: letters, digits, _ or -";

// --- Desktop-app config fields ------------------------------------------------
// Mirrors frontend/src/components/Identifiers/IdentifierFields.js.

export const DEFAULT_RECORDINGS_FILE_NAME =
  "${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}";

// null when valid, else the reason. `fieldNames` are the identifier names
// defined on the protocol; every ${field.x} must reference one of them.
export const validateFileNameTemplate = (tpl, fieldNames = []) => {
  const s = String(tpl ?? "");
  if (!s.includes("${taskIndex}")) return "recordings_file_name must contain ${taskIndex}";
  const unknown = [...s.matchAll(/\$\{field\.([^}]*)\}/g)]
    .map((m) => m[1])
    .filter((n) => !fieldNames.includes(n));
  return unknown.length
    ? `recordings_file_name references undefined identifier(s): ${unknown.join(", ")}`
    : null;
};

export const isValidHttpUrl = (v) => /^https?:\/\/\S+$/.test(String(v ?? ""));

// Site settings pushed to the desktop app (sites.config_json). Known keys are
// type-checked, unknown keys are stripped rather than rejected so callers that
// re-post an older config_json (activate/deactivate button) keep working.
const SITE_SETTING_TYPES = {
  defaultLanguage: "string",
  languages: "string[]",
  defaultMicName: "string",
  defaultMicGain: "number",
  enableEditor: "boolean",
  indicatorType: "CIRCLE|WAVEFORM",
  useCalibration: "boolean",
};

const matchesType = (v, type) => {
  if (type === "string[]") return Array.isArray(v) && v.every((x) => typeof x === "string");
  if (type.includes("|")) return type.split("|").includes(v);
  return typeof v === type && !(type === "number" && Number.isNaN(v));
};

// Returns { value } with only the known, well-typed keys, or { error }.
export const normalizeSiteSettings = (obj) => {
  if (obj == null) return { value: null };
  if (typeof obj !== "object" || Array.isArray(obj)) return { error: "config_json must be a JSON object" };
  const value = {};
  for (const [key, type] of Object.entries(SITE_SETTING_TYPES)) {
    if (obj[key] === undefined || obj[key] === null) continue;
    if (!matchesType(obj[key], type)) return { error: `config_json.${key} must be ${type}` };
    value[key] = obj[key];
  }
  return { value };
};
