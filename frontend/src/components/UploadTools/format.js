// Small formatting helpers (locale-aware, no mock-data dependency).
export const fmtDT = (iso, lang) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
};

// One byte formatter for all upload pages.
export { fmtBytes } from "../Uploads/format";

/** Relative time through i18n keys uploadTools:rel.* */
export const rel = (iso, t, now = Date.now()) => {
  if (!iso) return t("rel.never");
  const h = (now - new Date(iso).getTime()) / 3600e3;
  if (h < 1) return t("rel.minutes", { count: Math.max(1, Math.round(h * 60)) });
  if (h < 24) return t("rel.hours", { count: Math.round(h) });
  const d = Math.round(h / 24);
  return d === 1 ? t("rel.yesterday") : t("rel.days", { count: d });
};
