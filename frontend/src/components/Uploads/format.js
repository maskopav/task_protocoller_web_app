// Pure formatting helpers and enum metadata for the upload pages (ported from
// ui_design/assets/ui.js). Nothing here translates: labels come from the
// `uploads` i18n namespace (see useUploadLabels), so these stay testable.

export const STATUS_CLS = { valid: "ok", validating: "info", invalid: "bad" };
export const QC_META = {
  unreviewed: { cls: "outline", icon: "○" },
  ok: { cls: "ok", icon: "✓" },
  review: { cls: "warn", icon: "!" },
  excluded: { cls: "off", icon: "⊘" },
};
export const QC_KEYS = ["unreviewed", "ok", "review", "excluded"];
export const ISSUE_CLS = {
  recovered: "bad", interrupted: "bad", skipped: "warn", retakes: "", edited: "info", outdated: "warn",
  late: "warn", duplicate: "", nonstdMic: "bad", nonstdCam: "bad", device: "warn",
};
export const ISSUE_KEYS = Object.keys(ISSUE_CLS);
export const PAGE_SIZES = [10, 25, 50, 100];

const pad = (n) => String(n).padStart(2, "0");

/** d. m. yyyy in the viewer's local time. */
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}
export function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fmtDT = (iso) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : "—");

export function fmtDur(s) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min ${pad(Math.round(s % 60))} s`;
}
export function fmtDurShort(s) {
  if (s == null) return "—";
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)} h` : `${m} min`;
}
/** m:ss for clip lengths and timeline axes. */
export function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${pad(Math.round(sec % 60))}`;
}
export function fmtBytes(b) {
  if (b == null) return "—";
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${Math.round(b / 1e3)} kB`;
}

/** The session end; processedAt when the app never wrote endedAt (crash recovery). */
export const endOf = (row) => row.endedAt || row.processedAt;

/** Delay between the end of the session and its upload, as {unit, n} for i18n. */
export function lagParts(row) {
  const h = (new Date(row.receivedAt) - new Date(endOf(row))) / 3600e3;
  if (!Number.isFinite(h)) return null;
  if (h < 1) return { unit: "min", n: Math.max(0, Math.round(h * 60)) };
  if (h < 48) return { unit: "h", n: Math.round(h) };
  return { unit: "days", n: Math.round(h / 24) };
}
export const lagHours = (row) => (new Date(row.receivedAt) - new Date(endOf(row))) / 3600e3;

/** "x min ago" as {unit, n}; unit is min|h|yesterday|days. */
export function relParts(iso, now = Date.now()) {
  const h = (now - new Date(iso)) / 3600e3;
  if (h < 1) return { unit: "min", n: Math.max(1, Math.round(h * 60)) };
  if (h < 24) return { unit: "h", n: Math.round(h) };
  const d = Math.round(h / 24);
  return d === 1 ? { unit: "yesterday", n: 1 } : { unit: "days", n: d };
}

export const shortId = (id) => (id && id.length > 12 ? `${id.slice(0, 8)}…` : id);
export const prettyName = (s) => s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** yyyy-mm-dd for `daysAgo` days back, in local time (matches the From/To inputs). */
export function isoDay(daysAgo = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
