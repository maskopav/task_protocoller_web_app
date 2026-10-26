// Pure list logic of the Recordings table: URL query <-> filters <-> API params,
// the default order, the KPI cards and when the Clinic filter/column is shown.
import { PAGE_SIZES, isoDay } from "../Uploads/format";

export const STATUSES = ["valid", "validating", "invalid"];

/**
 * Filters from a URLSearchParams. ?clinic= / ?study= are the new names of ?site= / ?project=.
 * `fixed` ({clinic, study}) pins a filter (a study or clinic tab) and wins over the URL.
 */
export function readFilters(sp, fixed = {}) {
  const size = Number(sp.get("pageSize"));
  const site = fixed.clinic != null && fixed.clinic !== ""
    ? [String(fixed.clinic)]
    : [...new Set([...sp.getAll("site"), ...sp.getAll("clinic")])];
  const project = fixed.study != null && fixed.study !== "" ? String(fixed.study) : sp.get("project") || sp.get("study") || "";
  return {
    q: sp.get("q") || "",
    site,
    project,
    protocol: sp.get("protocol") || "",
    dateField: sp.get("dateField") === "recorded" ? "recorded" : "received",
    from: sp.get("from") || "",
    to: sp.get("to") || "",
    status: sp.get("status") || "",
    qc: sp.get("qc") || "",
    flag: sp.getAll("flag"),
    hasVideo: sp.get("hasVideo") === "1",
    attention: sp.get("attention") === "1",
    sort: sp.get("sort") || "receivedAt",
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(sp.get("page")) || 1),
    pageSize: PAGE_SIZES.includes(size) ? size : 25,
  };
}

const isDefaultSort = (f) => f.sort === "receivedAt" && f.dir === "desc";

/** Only non-default values go to the API. */
export function toApiParams(f) {
  return {
    q: f.q.trim(), site: f.site, project: f.project, protocol: f.protocol,
    dateField: f.from || f.to ? f.dateField : "", from: f.from, to: f.to, status: f.status, qc: f.qc, flag: f.flag,
    hasVideo: f.hasVideo ? "1" : "", attention: f.attention ? "1" : "",
    sort: isDefaultSort(f) ? "" : f.sort, dir: isDefaultSort(f) ? "" : f.dir,
    page: f.page > 1 ? f.page : "", pageSize: f.pageSize !== 25 ? f.pageSize : "",
  };
}

/**
 * The query string the detail page reads as `?ctx=` to make Previous/Next follow this list:
 * the API's own filter names (site, project...), without paging.
 */
export function listContext(f) {
  const params = { ...toApiParams(f), page: "", pageSize: "" };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.append(k, String(v));
  }
  return q.toString();
}

/** A key that changes whenever the result set (not just the page) changes: selection resets with it. */
export const filterKey = (f) => JSON.stringify({ ...toApiParams(f), page: "", pageSize: "" });

/** Does any filter narrow the list (beyond the fixed ones)? */
export function hasActiveFilters(f, fixed = {}) {
  return !!(f.q.trim() || (f.site.length && fixed.clinic == null) || (f.project && fixed.study == null) || f.protocol
    || f.from || f.to || f.status || f.qc || f.flag.length || f.hasVideo || f.attention);
}

/** Default order: unreviewed first, then newest. Applies to the default sort only; the server order is kept within each group. */
export function orderRows(rows, f) {
  if (!isDefaultSort(f)) return rows;
  const open = rows.filter((r) => r.qc === "unreviewed");
  return open.length === 0 || open.length === rows.length ? rows : [...open, ...rows.filter((r) => r.qc !== "unreviewed")];
}

/**
 * The Clinic filter and column exist only when there is a choice: a master always (recordings can be
 * in quarantine, without a clinic), anyone else with more than one clinic. A pinned clinic hides both.
 */
export function showClinic({ isMaster, clinicCount, fixedClinic }) {
  if (fixedClinic != null && fixedClinic !== "") return false;
  return !!isMaster || clinicCount > 1;
}

/** Date preset of the date select, derived from from/to. */
export function datePreset(f, now = new Date()) {
  if (!f.from && !f.to) return "any";
  if (!f.to && f.from === isoDay(0, now)) return "today";
  if (!f.to && f.from === isoDay(7, now)) return "week";
  if (!f.to && f.from === isoDay(30, now)) return "month";
  return "custom";
}

/** URL patch for a date preset (custom keeps whatever is set). */
export function datePresetPatch(preset, now = new Date()) {
  switch (preset) {
    case "any": return { from: "", to: "", dateField: "" };
    case "today": return { from: isoDay(0, now), to: "", dateField: "" };
    case "week": return { from: isoDay(7, now), to: "", dateField: "" };
    case "month": return { from: isoDay(30, now), to: "", dateField: "" };
    default: return {};
  }
}

/**
 * KPI cards. Each toggles its filter: `patch` is the URL patch that applies it, or clears it when `on`.
 * @param {object} f filters
 * @param {object} [kpis] kpis of GET /uploads (received7d, invalid, attention, unreviewed)
 */
export function kpiCards(f, kpis, now = new Date()) {
  const weekFrom = isoDay(7, now);
  const weekOn = f.from === weekFrom && !f.to && f.dateField === "received";
  return [
    { key: "unreviewed", tone: "accent", value: kpis?.unreviewed, on: f.qc === "unreviewed", patch: { qc: f.qc === "unreviewed" ? "" : "unreviewed" } },
    { key: "attention", tone: "warn", value: kpis?.attention, on: f.attention, patch: { attention: !f.attention } },
    { key: "invalid", tone: "bad", value: kpis?.invalid, on: f.status === "invalid", patch: { status: f.status === "invalid" ? "" : "invalid" } },
    { key: "week", tone: "idle", value: kpis?.received7d, on: weekOn, patch: weekOn ? { from: "", to: "" } : { from: weekFrom, to: "", dateField: "" } },
  ];
}

/** The window of page numbers around the current page, with "gapN" markers. */
export function pageWindow(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out = [];
  [...set].sort((a, b) => a - b).forEach((n, i, arr) => {
    if (i && n - arr[i - 1] > 1) out.push(`gap${n}`);
    out.push(n);
  });
  return out;
}
