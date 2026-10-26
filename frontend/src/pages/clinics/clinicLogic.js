// Pure helpers of the Clinics screens: computer status, per-clinic grouping, version compare,
// desktop-settings defaults and the access-token generator.

/** Computer status shown in the tables: key (i18n), tone (StatusDot) and a sort rank (worst first). */
export function computerStatus(d) {
  const key = d?.health?.key;
  if (d?.siteId == null || key === "unassigned") return { key: "unassigned", tone: "warn", rank: 0 };
  if (key === "bad") return { key: "silent", tone: "bad", rank: 1 };
  if (!d.backlogHidden && d.failed > 0) return { key: "failing", tone: "bad", rank: 2 };
  if (key === "warn" || (!d.backlogHidden && d.pending > 0)) return { key: "waiting", tone: "warn", rank: 3 };
  if (key === "off") return { key: "noUploads", tone: "idle", rank: 4 };
  return { key: "healthy", tone: "ok", rank: 5 };
}

export const computerName = (d) => d.label || d.installationId;

/** Worst first, then by name. */
export function sortComputers(devices) {
  return [...devices].sort(
    (a, b) => computerStatus(a).rank - computerStatus(b).rank || computerName(a).localeCompare(computerName(b)),
  );
}

/** devices -> Map(siteId -> {count, tone}) where tone is the worst status tone among the clinic's computers. */
export function summariseByClinic(devices) {
  const TONE_RANK = { bad: 0, warn: 1, idle: 2, ok: 3 };
  const out = new Map();
  for (const d of devices || []) {
    if (d.siteId == null) continue;
    const cur = out.get(d.siteId) || { count: 0, tone: "ok" };
    const tone = computerStatus(d).tone;
    out.set(d.siteId, { count: cur.count + 1, tone: TONE_RANK[tone] < TONE_RANK[cur.tone] ? tone : cur.tone });
  }
  return out;
}

const parts = (v) => String(v || "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
export function compareVersions(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function newestVersion(devices) {
  return (devices || []).reduce(
    (best, d) => (d.appVersion && (!best || compareVersions(d.appVersion, best) > 0) ? d.appVersion : best),
    null,
  );
}

/** A 32-character hex access token (the backend accepts [A-Za-z0-9_-]{16,64}). */
export function generateAccessToken(cryptoObj = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Desktop-app settings stored in sites.config_json (exact keys the app reads; see normalizeSiteSettings).
export const SETTINGS_DEFAULTS = {
  defaultLanguage: "en",
  languages: [],
  defaultMicName: "",
  defaultMicGain: "",
  enableEditor: false,
  indicatorType: "CIRCLE",
  useCalibration: true,
};
export const APP_LANGUAGES = ["en", "cs", "de"];

export const pickSettings = (raw) =>
  Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map((k) => [k, raw?.[k] ?? SETTINGS_DEFAULTS[k]]));

/** Form settings -> config_json payload, or {error:'invalidMicGain'}. An empty gain is omitted. */
export function settingsPayload(settings) {
  const { defaultMicGain: rawGain, ...rest } = settings;
  const gain = String(rawGain ?? "").trim() === "" ? null : Number(rawGain);
  if (gain !== null && !(Number.isInteger(gain) && gain >= 0 && gain <= 100)) return { error: "invalidMicGain" };
  return { value: gain === null ? rest : { ...rest, defaultMicGain: gain } };
}

export const NAME_MAX = 64;
/** "ok" | "required" | "tooLong" for the clinic name field (spec F-008: free text, 1 to 64 characters). */
export function nameProblem(name) {
  const n = String(name ?? "").trim();
  if (!n) return "required";
  return n.length > NAME_MAX ? "tooLong" : "ok";
}
