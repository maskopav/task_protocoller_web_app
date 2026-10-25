// src/pages/DownloadsPage.jsx — phase B upload management: bundle download of many
// sessions (spec §9, ui_design/downloads.html).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { downloadBundle, fetchUploads } from "../api/uploads";
import { fetchSites } from "../api/sites";
import { fetchProjectsList } from "../api/projects";
import { fmtBytes, fmtDT } from "../components/UploadTools/format";
import { IssueTags, QcPill, StatusPill } from "../components/UploadTools/Pills";
import { ISSUE_CLS, QC_META } from "../components/Uploads/format";
import {
  blockedReason, checkBundleLimits, filterRows, isBulkSelectable, sessionEnd,
  MAX_BUNDLE_BYTES, MAX_BUNDLE_SESSIONS,
} from "../components/UploadTools/selection";
import "./Pages.css";
import "../components/UploadTools/UploadTools.css";

const PAGE_SIZE = 100;
const NO_ROWS = [];

export default function DownloadsPage() {
  const { t, i18n } = useTranslation("uploadTools");
  const navigate = useNavigate();

  const [by, setBy] = useState("site");
  const [sources, setSources] = useState({ site: null, project: null }); // [{id, name}] once loaded
  const [key, setKey] = useState("");
  const [rows, setRows] = useState(NO_ROWS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qc, setQc] = useState("");
  const [protocol, setProtocol] = useState("");
  const [hideBad, setHideBad] = useState(true);
  const [excludeFlags, setExcludeFlags] = useState(() => new Set());
  const [sel, setSel] = useState(() => new Set());
  const [message, setMessage] = useState(null); // {kind, text}
  const loadToken = useRef(0);

  // Pickers: sites and projects in the caller's scope (the server scopes both lists).
  useEffect(() => {
    fetchSites()
      .then((s) => setSources((p) => ({ ...p, site: (Array.isArray(s) ? s : []).map((x) => ({ id: String(x.id), name: x.name })) })))
      .catch(() => setSources((p) => ({ ...p, site: [] })));
    fetchProjectsList()
      .then((s) => setSources((p) => ({ ...p, project: (Array.isArray(s) ? s : []).map((x) => ({ id: String(x.project_id), name: x.project_name })) })))
      .catch(() => setSources((p) => ({ ...p, project: [] })));
  }, []);

  const list = sources[by];
  useEffect(() => {
    if (list && list.length && !list.some((s) => s.id === key)) setKey(list[0].id);
  }, [list, key]);

  // Page through GET /uploads for the chosen source.
  const loadAll = useCallback(async (source, id) => {
    const token = ++loadToken.current;
    setRows(NO_ROWS); setTotal(0); setError(""); setLoading(true);
    try {
      let all = [];
      for (let page = 1; ; page++) {
        const res = await fetchUploads({ [source]: id, pageSize: PAGE_SIZE, page, sort: "receivedAt", dir: "desc" });
        if (token !== loadToken.current) return;
        all = all.concat(res.rows);
        setRows(all);
        setTotal(res.total);
        if (!res.rows.length || all.length >= res.total) break;
      }
    } catch (err) {
      if (token === loadToken.current) setError(err.message || t("downloads.loadError"));
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (key) loadAll(by, key);
  }, [by, key, loadAll]);

  const protocols = useMemo(() => [...new Set(rows.map((r) => r.protocol))].sort(), [rows]);
  const activeProtocol = protocols.includes(protocol) ? protocol : "";
  const visible = useMemo(
    () => filterRows(rows, { hideBad, qc, protocol: activeProtocol, excludeFlags })
      .sort((a, b) => sessionEnd(b).localeCompare(sessionEnd(a))),
    [rows, hideBad, qc, activeProtocol, excludeFlags]
  );

  const chosen = visible.filter((s) => sel.has(s.id) && !blockedReason(s));
  const limits = checkBundleLimits(chosen);
  const selectable = visible.filter(isBulkSelectable);
  const notDownloadable = visible.filter(blockedReason).length;
  const allChecked = selectable.length > 0 && selectable.every((s) => sel.has(s.id));

  const switchBy = (v) => { setBy(v); setKey(""); setSel(new Set()); setMessage(null); };
  const switchKey = (v) => { setKey(v); setSel(new Set()); setMessage(null); };
  const toggleOne = (id, on) => setSel((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
  const toggleAll = (on) => setSel((p) => { const n = new Set(p); selectable.forEach((s) => (on ? n.add(s.id) : n.delete(s.id))); return n; });
  const toggleFlag = (k) => setExcludeFlags((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const download = async () => {
    if (!limits.ok) {
      setMessage({
        kind: "warn",
        text: t("downloads.tooLarge", { count: limits.count, size: fmtBytes(limits.bytes), maxCount: MAX_BUNDLE_SESSIONS, maxSize: fmtBytes(MAX_BUNDLE_BYTES) }),
      });
      return;
    }
    try {
      await downloadBundle(chosen.map((s) => s.id));
      setMessage({ kind: "ok", text: t("downloads.started") });
    } catch (err) {
      setMessage({ kind: "bad", text: err.message || t("downloads.failed") });
    }
  };

  const noSources = list && list.length === 0;
  const blockedTitle = (s) => {
    const r = blockedReason(s);
    return r ? t(`downloads.blocked.${r}`) : undefined;
  };

  return (
    <div className="dashboard-page ut-scope">
      <div className="ut-wide">
        <div className="page-header">
          <h1 className="page-title">{t("downloads.title")}</h1>
          <p className="project-description">{t("downloads.description")}</p>
        </div>

        <section className="ut-card">
          <div className="ut-filters">
            <div className="ut-filter-row">
              <div className="ut-field"><span>{t("downloads.from")}</span>
                <div className="ut-seg" role="group" aria-label={t("downloads.from")}>
                  <button type="button" aria-pressed={by === "site"} onClick={() => switchBy("site")}>{t("downloads.site")}</button>
                  <button type="button" aria-pressed={by === "project"} onClick={() => switchBy("project")}>{t("downloads.project")}</button>
                </div>
              </div>
              <label className="ut-field grow"><span>{by === "site" ? t("downloads.site") : t("downloads.project")}</span>
                <select value={key} onChange={(e) => switchKey(e.target.value)} disabled={!list || !list.length}>
                  {(list || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="ut-field"><span>{t("downloads.protocol")}</span>
                <select value={activeProtocol} onChange={(e) => setProtocol(e.target.value)}>
                  <option value="">{t("downloads.allProtocols")}</option>
                  {protocols.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="ut-field"><span>{t("downloads.review")}</span>
                <select value={qc} onChange={(e) => setQc(e.target.value)}>
                  <option value="">{t("downloads.any")}</option>
                  {Object.keys(QC_META).map((k) => <option key={k} value={k}>{t(`qc.${k}`)}</option>)}
                </select>
              </label>
              <label className="ut-check">
                <input type="checkbox" checked={hideBad} onChange={(e) => setHideBad(e.target.checked)} /> {t("downloads.hideBad")}
              </label>
            </div>
            <div className="ut-chips">
              <span className="ut-chips-label">{t("downloads.excludeFlags")}</span>
              {Object.keys(ISSUE_CLS).map((k) => (
                <button key={k} type="button" className="ut-chip" aria-pressed={excludeFlags.has(k)}
                  title={`${t("downloads.excludeHint")} ${t(`issues.${k}.hint`)}`} onClick={() => toggleFlag(k)}>
                  {t(`issues.${k}.label`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="ut-card">
          <div className="ut-section-head">
            <h2 className="ut-section-title">{t("downloads.sessions")}</h2>
            <span className="ut-section-sub">
              {t("downloads.count", { count: visible.length })}
              {notDownloadable ? ` · ${t("downloads.notDownloadable", { count: notDownloadable })}` : ""}
              {loading ? ` · ${t("downloads.loading", { loaded: rows.length, total })}` : ""}
            </span>
          </div>
          {error && <div className="ut-note bad" role="alert">{error}</div>}
          <div className="ut-table-wrap tall">
            <table className="ut-table">
              <thead>
                <tr>
                  <th className="c">
                    <input type="checkbox" aria-label={t("downloads.selectAll")} checked={allChecked} disabled={!selectable.length}
                      ref={(el) => { if (el) el.indeterminate = !allChecked && chosen.length > 0; }}
                      onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  <th>{t("downloads.col.recorded")}</th><th>{t("downloads.col.patient")}</th><th>{t("downloads.col.protocol")}</th>
                  <th>{by === "site" ? t("downloads.col.project") : t("downloads.col.site")}</th>
                  <th className="r">{t("downloads.col.size")}</th><th>{t("downloads.col.status")}</th>
                  <th>{t("downloads.col.review")}</th><th>{t("downloads.col.flags")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length ? visible.map((s) => {
                  const why = blockedTitle(s);
                  const attention = s.status === "invalid" ? "row-bad" : s.needsAttention ? "row-warn" : "";
                  return (
                    <tr key={s.id} className={`clickable ${attention}`}
                      onClick={(e) => { if (!e.target.closest("input")) navigate(`/recordings/${s.id}`); }}>
                      <td className="c">
                        <input type="checkbox" checked={sel.has(s.id)} disabled={!!why} title={why}
                          aria-label={t("downloads.selectRow", { code: s.participant?.patient_code || s.id })}
                          onChange={(e) => toggleOne(s.id, e.target.checked)} />
                      </td>
                      <td className="ut-num">{fmtDT(sessionEnd(s), i18n.language)}</td>
                      <td><div className="stack"><span className="main">{s.participant?.patient_code}</span><span className="sub">{s.participant?.visit_number || ""}</span></div></td>
                      <td>{s.protocol}</td>
                      <td>{by === "site" ? s.project : s.site}</td>
                      <td className="r ut-num">{fmtBytes(s.bytes)}</td>
                      <td><StatusPill status={s.status} invalidReason={s.invalidReason} /></td>
                      <td><QcPill qc={s.qc} /></td>
                      <td className="flags"><IssueTags issues={s.issues} /></td>
                    </tr>
                  );
                }) : (
                  <tr className="empty"><td colSpan={9}>
                    {noSources ? t("downloads.nothingInScope") : loading ? t("common.loading") : t("downloads.noMatch")}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {message && <div className={`ut-note ${message.kind}`} role="status">{message.text}</div>}
          <div className="ut-dl-bar">
            <span className="info">
              {chosen.length
                ? <><strong>{chosen.length}</strong> {t("downloads.selected", { size: fmtBytes(limits.bytes) })}</>
                : t("downloads.nothingSelected")}
            </span>
            <button type="button" className="ut-btn ut-btn-ghost ut-btn-sm" disabled={!chosen.length} onClick={() => { setSel(new Set()); setMessage(null); }}>
              {t("downloads.clear")}
            </button>
            <button type="button" className="ut-btn ut-btn-primary" disabled={!chosen.length} onClick={download}>
              ⬇ {chosen.length ? t("downloads.downloadN", { count: chosen.length }) : t("downloads.download")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
