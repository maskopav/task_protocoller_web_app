// Small formatting helpers (locale-aware, no mock-data dependency).
export const fmtDT = (iso, lang) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
};

export const fmtBytes = (b) => {
  b = Number(b) || 0;
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${Math.round(b / 1e3)} kB`;
};

/** Relative time through i18n keys uploadTools:rel.* */
export const rel = (iso, t, now = Date.now()) => {
  if (!iso) return t("rel.never");
  const h = (now - new Date(iso).getTime()) / 3600e3;
  if (h < 1) return t("rel.minutes", { count: Math.max(1, Math.round(h * 60)) });
  if (h < 24) return t("rel.hours", { count: Math.round(h) });
  const d = Math.round(h / 24);
  return d === 1 ? t("rel.yesterday") : t("rel.days", { count: d });
};
