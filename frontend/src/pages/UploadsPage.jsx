// src/pages/UploadsPage.jsx — phase B upload management: the sessions list
// (docs/upload_management/ui_design/uploads.html). Filters, sort and page live in the
// URL query string, and the server does all filtering, sorting, paging and counting.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import StatusPill from "../components/Uploads/StatusPill";
import QcPill from "../components/Uploads/QcPill";
import FlagTags from "../components/Uploads/FlagTags";
import useUploadLabels from "../components/Uploads/useUploadLabels";
import { fetchUploads, downloadSessionZip, downloadUploadsCsv } from "../api/uploads";
import {
  ISSUE_KEYS, PAGE_SIZES, QC_KEYS, endOf, fmtBytes, fmtDate, fmtDT, fmtDurShort, fmtTime, isoDay, shortId,
} from "../components/Uploads/format";
import "./Pages.css";
import "../components/Uploads/Uploads.css";

const COLUMNS = [
  { k: "receivedAt", label: "received", first: "desc" },
  { k: "site", label: "siteDevice", first: "asc" },
  { k: "patient", label: "patient", first: "asc" },
  { k: "protocol", label: "protocol", first: "asc" },
  { k: "endedAt", label: "recorded", first: "desc" },
  { k: "durationS", label: "length", first: "desc", cls: "r" },
  { label: "tasks" },
  { label: "clips", cls: "c" },
  { k: "bytes", label: "size", first: "desc", cls: "r" },
  { k: "status", label: "serverCheck", first: "asc" },
  { k: "qc", label: "review", first: "asc" },
  { label: "flags" },
];
const STATUSES = ["valid", "validating", "invalid"];

function readFilters(sp) {
  const size = Number(sp.get("pageSize"));
  return {
    q: sp.get("q") || "",
    site: [...new Set([...sp.getAll("site"), ...sp.getAll("clinic")])], // ?clinic= is the new name of ?site=
    project: sp.get("project") || sp.get("study") || "",
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

// Only non-default values go to the API (and the URL).
function toApiParams(f) {
  return {
    q: f.q.trim(), site: f.site, project: f.project, protocol: f.protocol,
    dateField: f.from || f.to ? f.dateField : "", from: f.from, to: f.to, status: f.status, qc: f.qc, flag: f.flag,
    hasVideo: f.hasVideo ? "1" : "", attention: f.attention ? "1" : "",
    sort: f.sort === "receivedAt" && f.dir === "desc" ? "" : f.sort, dir: f.sort === "receivedAt" && f.dir === "desc" ? "" : f.dir,
    page: f.page > 1 ? f.page : "", pageSize: f.pageSize !== 25 ? f.pageSize : "",
  };
}

function pageWindow(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out = [];
  [...set].sort((a, b) => a - b).forEach((n, i, arr) => {
    if (i && n - arr[i - 1] > 1) out.push("gap" + n);
    out.push(n);
  });
  return out;
}

export default function UploadsPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { t } = useTranslation(["uploads", "common"]);
  const L = useUploadLabels();
  const f = useMemo(() => readFilters(sp), [sp]);
  const apiParams = useMemo(() => toApiParams(f), [f]);
  const listQuery = sp.toString();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState({ projects: [], protocols: [] });
  const [qText, setQText] = useState(f.q);
  const [busyCsv, setBusyCsv] = useState(false);

  // Replace keys in the URL. Any change except paging itself returns to page 1.
  const update = useCallback((patch, { replace = false } = {}) => {
    const next = new URLSearchParams(sp);
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (key === "site") next.delete("clinic");
      if (key === "project") next.delete("study");
      const vals = Array.isArray(value) ? value : [value];
      vals.forEach((v) => v !== "" && v != null && v !== false && next.append(key, v === true ? "1" : String(v)));
    }
    if (!("page" in patch)) next.delete("page");
    setSp(next, { replace });
  }, [sp, setSp]);

  // Load the list for the current URL; ignore responses that arrive out of order.
  const key = JSON.stringify(apiParams);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchUploads(apiParams)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The API has no project/protocol facets, so the selects offer what the user's scope
  // contains: the distinct values of one unfiltered page, plus any seen later.
  useEffect(() => {
    fetchUploads({ pageSize: 100 }).then((d) => collect(d.rows)).catch(() => {});
  }, []);
  const collect = (rows) => setOptions((o) => ({
    projects: [...new Set([...o.projects, ...rows.map((r) => r.project).filter(Boolean)])].sort(),
    protocols: [...new Set([...o.protocols, ...rows.map((r) => r.protocol).filter(Boolean)])].sort(),
  }));
  useEffect(() => { if (data?.rows) collect(data.rows); }, [data]);

  // Search box: debounce into the URL without piling up history entries.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const id = setTimeout(() => { if (qText.trim() !== f.q) update({ q: qText.trim() }, { replace: true }); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);
  useEffect(() => setQText(f.q), [f.q]);

  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const weekFrom = isoDay(7);
  const kpiDefs = [
    { k: "week", cls: "", value: data?.kpis.received7d, on: f.from === weekFrom && !f.to && f.dateField === "received", set: () => (f.from === weekFrom ? update({ from: "", to: "" }) : update({ from: weekFrom, to: "", dateField: "" })) },
    { k: "valid", cls: "ok", value: data?.kpis.valid, on: f.status === "valid", set: () => update({ status: f.status === "valid" ? "" : "valid" }) },
    { k: "invalid", cls: "bad", value: data?.kpis.invalid, on: f.status === "invalid", set: () => update({ status: f.status === "invalid" ? "" : "invalid" }) },
    { k: "attention", cls: "warn", value: data?.kpis.attention, on: f.attention, set: () => update({ attention: !f.attention }) },
    { k: "unreviewed", cls: "off", value: data?.kpis.unreviewed, on: f.qc === "unreviewed", set: () => update({ qc: f.qc === "unreviewed" ? "" : "unreviewed" }) },
  ];

  const sortBy = (col) => {
    if (!col.k) return;
    if (f.sort === col.k) update({ sort: col.k, dir: f.dir === "asc" ? "desc" : "asc" });
    else update({ sort: col.k, dir: col.first });
  };

  const clearAll = () => { setQText(""); setSp(new URLSearchParams(), {}); };
  const siteName = (id) => data?.facets.sites.find((s) => String(s.id) === String(id))?.name || id;
  const active = [];
  if (f.attention) active.push(t("kpi.attention.label"));
  if (f.from === weekFrom && !f.to) active.push(t("kpi.week.label"));
  else if (f.from || f.to) active.push(`${t(`filters.${f.dateField}`)} ${f.from || "…"} → ${f.to || "…"}`);
  f.site.forEach((s) => active.push(siteName(s)));
  f.flag.forEach((k) => active.push(L.issue(k)));
  if (f.hasVideo) active.push(t("filters.hasVideo"));
  if (f.project) active.push(f.project);
  if (f.protocol) active.push(f.protocol);
  if (f.status) active.push(L.status(f.status));
  if (f.qc) active.push(L.qc(f.qc));
  if (f.q) active.push(`“${f.q}”`);

  const open = (id) => navigate(`/recordings/${id}?ctx=${encodeURIComponent(listQuery)}`);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / f.pageSize));
  const rows = data?.rows ?? [];
  const startN = rows.length ? (f.page - 1) * f.pageSize + 1 : 0;

  const exportCsv = async () => {
    setBusyCsv(true);
    try { await downloadUploadsCsv({ ...apiParams, page: "", pageSize: "" }); } catch { setError(t("list.csvFailed")); } finally { setBusyCsv(false); }
  };
  const download = async (e, id) => {
    e.stopPropagation();
    try { await downloadSessionZip(id); } catch { setError(t("session.downloadFailed")); }
  };

  const showSites = (data?.facets.sites.length ?? 0) > 1 || f.site.length > 0;

  return (
    <div className="dashboard-page um-page">

      <div className="um-header">
        <div className="um-title-row">
          <h1 className="um-title">{t("list.title")}</h1>
          <div className="um-actions">
            <Link className="um-btn um-btn-ghost" to="/clinics/devices">🖥 {t("list.devices")}</Link>
            <button className="um-btn um-btn-ghost" type="button" onClick={exportCsv} disabled={busyCsv}>⬇ {t("list.exportCsv")}</button>
          </div>
        </div>
        <p className="um-desc">{t("list.description")}</p>
      </div>

      <div className="um-kpis">
        {kpiDefs.map((x) => (
          <button key={x.k} type="button" className={`um-kpi ${x.cls}`} aria-pressed={x.on} onClick={x.set}>
            <span className="k-label">{t(`kpi.${x.k}.label`)}</span>
            <span className="k-value">{x.value ?? "–"}</span>
            <span className="k-hint">{t(`kpi.${x.k}.hint`)}</span>
          </button>
        ))}
      </div>

      <section className="um-card">
        <div className="um-filters">
          <div className="um-filter-row">
            <label className="um-field grow search">
              <span>{t("filters.search")}</span>
              <input type="search" value={qText} placeholder={t("filters.searchPlaceholder")} onChange={(e) => setQText(e.target.value)} />
            </label>
            <label className="um-field">
              <span>{t("filters.project")}</span>
              <select value={f.project} onChange={(e) => update({ project: e.target.value })}>
                <option value="">{t("filters.allProjects")}</option>
                {[...new Set([...options.projects, f.project].filter(Boolean))].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="um-field">
              <span>{t("filters.protocol")}</span>
              <select value={f.protocol} onChange={(e) => update({ protocol: e.target.value })}>
                <option value="">{t("filters.allProtocols")}</option>
                {[...new Set([...options.protocols, f.protocol].filter(Boolean))].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <div className="um-field">
              <span>{t("filters.date")}</span>
              <div className="um-seg" role="group" aria-label={t("filters.dateRefersTo")}>
                {["received", "recorded"].map((d) => (
                  <button key={d} type="button" aria-pressed={f.dateField === d} onClick={() => update({ dateField: d === "received" ? "" : d }, { replace: false })}>{t(`filters.${d}`)}</button>
                ))}
              </div>
            </div>
            <label className="um-field"><span>{t("filters.from")}</span><input type="date" value={f.from} onChange={(e) => update({ from: e.target.value })} /></label>
            <label className="um-field"><span>{t("filters.to")}</span><input type="date" value={f.to} onChange={(e) => update({ to: e.target.value })} /></label>
            <label className="um-field">
              <span>{t("filters.serverCheck")}</span>
              <select value={f.status} onChange={(e) => update({ status: e.target.value })}>
                <option value="">{t("filters.any")}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{L.status(s)}</option>)}
              </select>
            </label>
            <label className="um-field">
              <span>{t("filters.review")}</span>
              <select value={f.qc} onChange={(e) => update({ qc: e.target.value })}>
                <option value="">{t("filters.any")}</option>
                {QC_KEYS.map((k) => <option key={k} value={k}>{L.qc(k)}</option>)}
              </select>
            </label>
          </div>
          {showSites && (
            <div className="um-chips">
              <span className="um-chips-label">{t("filters.sites")}</span>
              {(data?.facets.sites ?? []).map((s) => (
                <button key={s.id} type="button" className="um-chip" aria-pressed={f.site.includes(String(s.id))} onClick={() => update({ site: toggle(f.site, String(s.id)) })}>
                  {s.name}<span className="c">{s.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="um-chips">
            <span className="um-chips-label">{t("filters.flags")}</span>
            {ISSUE_KEYS.map((k) => (
              <button key={k} type="button" className="um-chip" title={L.issueHint(k)} aria-pressed={f.flag.includes(k)} onClick={() => update({ flag: toggle(f.flag, k) })}>
                {L.issue(k)}<span className="c">{data?.facets.flags.find((x) => x.key === k)?.count ?? 0}</span>
              </button>
            ))}
            <button type="button" className="um-chip" aria-pressed={f.hasVideo} onClick={() => update({ hasVideo: !f.hasVideo })}>
              {t("filters.hasVideo")}<span className="c">{data?.facets.video ?? 0}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="um-card">
        <div className="um-section-head">
          <h2 className="um-section-title">{t("list.sessions")}</h2>
          <div className="um-active-filters">
            {active.length > 0 && (
              <>
                {t("list.filteredBy", { filters: active.join(", ") })} · <button className="um-linklike" type="button" onClick={clearAll}>{t("list.clearFilters")}</button>
              </>
            )}
          </div>
        </div>
        {error && <div className="um-error" role="alert">{error} <button className="um-linklike" type="button" onClick={() => setSp(new URLSearchParams(sp))}>{t("list.retry")}</button></div>}
        <div className={`um-table-wrap tall${loading ? " loading" : ""}`} aria-busy={loading}>
          <table className="um-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className={`${c.k ? "sortable" : ""} ${c.cls || ""}`}
                    aria-sort={c.k ? (f.sort === c.k ? (f.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                    onClick={() => sortBy(c)}
                  >
                    {t(`columns.${c.label}`)}
                  </th>
                ))}
                <th><span className="um-visually-hidden">{t("columns.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr className="empty-row">
                  <td colSpan={13}>
                    <strong>{t("list.empty")}</strong><br />
                    {t("list.emptyHint")} <button className="um-linklike" type="button" onClick={clearAll}>{t("list.clearFilters")}</button>.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const sk = r.tasksSkipped, miss = r.tasksTotal - r.tasksDone - sk;
                const stripe = r.status === "invalid" ? "row-bad" : r.needsAttention ? "row-warn" : "";
                return (
                  <tr key={r.id} className={`clickable ${stripe}`} tabIndex={0} onClick={() => open(r.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(r.id); }}>
                    <td><div className="stack"><span className="um-num">{fmtDate(r.receivedAt)}</span><span className="cell-sub um-num">{fmtTime(r.receivedAt)} · {L.rel(r.receivedAt)}</span></div></td>
                    <td><div className="stack"><span>{r.site}</span><span className="cell-sub">{r.deviceLabel || shortId(r.deviceId)}</span></div></td>
                    <td><div className="stack"><span className="cell-main">{r.participant.patient_code || "—"}</span><span className="cell-sub">{r.participant.visit_number} · <span className="um-mono">{r.id.slice(0, 8)}</span></span></div></td>
                    <td><div className="stack"><span>{r.protocol}</span><span className="cell-sub">{r.project}</span></div></td>
                    <td>
                      <div className="stack">
                        <span className="um-num">{fmtDT(endOf(r))}{!r.endedAt && <> <span className="um-tag bad" title={t("session.notFinishedHint")}>{t("session.notFinished")}</span></>}</span>
                        <span className="cell-sub">{t("list.toUpload", { lag: L.lag(r) })}</span>
                      </div>
                    </td>
                    <td className="r um-num">{fmtDurShort(r.durationS)}</td>
                    <td>
                      <div className="stack" title={t("list.tasksTitle", { done: r.tasksDone, skipped: sk, missing: miss, total: r.tasksTotal })}>
                        <span className="um-num">{r.tasksDone}/{r.tasksTotal}{sk > 0 && <> <span className="cell-sub">· {t("list.skipped", { count: sk })}</span></>}</span>
                        <span className="um-taskbar"><i className="d" style={{ width: `${(r.tasksDone / (r.tasksTotal || 1)) * 100}%` }} /><i className="s" style={{ width: `${(sk / (r.tasksTotal || 1)) * 100}%` }} /></span>
                      </div>
                    </td>
                    <td className="c um-num">{r.hasAudio ? `🎙 ${r.audioClips}` : <span className="um-muted">—</span>}{r.videoClips ? ` · 🎥 ${r.videoClips}` : ""}</td>
                    <td className="r um-num">{fmtBytes(r.bytes)}</td>
                    <td><div className="stack"><StatusPill status={r.status} invalidReason={r.invalidReason} />{r.status === "invalid" && <span className="cell-sub" style={{ color: "var(--bad-fg)" }}>{L.invalidReason(r.invalidReason)}</span>}</div></td>
                    <td><QcPill qc={r.qc} />{r.commentCount > 0 && <> <span className="cell-sub" title={t("list.comments")}>💬 {r.commentCount}</span></>}</td>
                    <td className="flags"><FlagTags issues={r.issues} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="um-actions-cell">
                        <Link className="um-icon-btn" to={`/recordings/${r.id}?ctx=${encodeURIComponent(listQuery)}`} title={t("list.openSession")} aria-label={t("list.openSession")}>🔍</Link>
                        {r.canEdit && (
                          <button className="um-icon-btn light" type="button" title={t("session.download")} aria-label={t("session.download")} disabled={r.status === "validating"} onClick={(e) => download(e, r.id)}>⬇</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="um-table-foot">
          <span>{t("list.showing", { from: startN, to: startN ? startN + rows.length - 1 : 0, total })}</span>
          <div className="um-pager">
            <label className="um-muted" style={{ fontSize: "0.8rem" }}>
              {t("list.rows")}{" "}
              <select value={f.pageSize} onChange={(e) => update({ pageSize: e.target.value === "25" ? "" : e.target.value })}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" disabled={f.page <= 1} aria-label={t("list.prevPage")} onClick={() => update({ page: f.page - 1 > 1 ? f.page - 1 : "" })}>‹</button>
            {pageWindow(f.page, pages).map((n) => (typeof n === "string"
              ? <span key={n}>…</span>
              : <button key={n} type="button" aria-current={n === f.page ? "page" : undefined} onClick={() => update({ page: n > 1 ? n : "" })}>{n}</button>))}
            <button type="button" disabled={f.page >= pages} aria-label={t("list.nextPage")} onClick={() => update({ page: f.page + 1 })}>›</button>
          </div>
        </div>
      </section>
    </div>
  );
}
