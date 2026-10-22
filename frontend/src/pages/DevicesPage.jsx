// src/pages/DevicesPage.jsx — phase B upload management: every computer running the
// desktop app at the user's sites (spec §6, ui_design/devices.html).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { useUser } from "../context/UserContext";
import { assignDeviceSite, fetchDevices, renameDevice } from "../api/uploads";
import { fetchSites } from "../api/sites";
import { fmtDT, rel } from "../components/UploadTools/format";
import "./Pages.css";
import "../components/UploadTools/UploadTools.css";

const HEALTH_RANK = { bad: 0, warn: 1, off: 2, ok: 3 };
const displayName = (d) => d.label || d.installationId;

const versionParts = (v) => String(v || "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
function compareVersions(a, b) {
  const pa = versionParts(a), pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function sortDevices(devices) {
  return [...devices].sort(
    (a, b) =>
      (HEALTH_RANK[a.health?.key] ?? 9) - (HEALTH_RANK[b.health?.key] ?? 9) ||
      displayName(a).localeCompare(displayName(b))
  );
}

export default function DevicesPage() {
  const { t, i18n } = useTranslation("uploadTools");
  const navigate = useNavigate();
  const { user } = useUser();
  const isMaster = user?.role_id === 1;

  const [data, setData] = useState({ devices: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [notice, setNotice] = useState(null); // {kind, text}
  const [sites, setSites] = useState([]);
  const [renaming, setRenaming] = useState(null); // {id, value}
  const [assigning, setAssigning] = useState(null); // {id, siteId, confirm}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchDevices());
      setError("");
    } catch (err) {
      setError(err.message || t("devices.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isMaster) return;
    fetchSites().then((s) => setSites(Array.isArray(s) ? s : [])).catch(() => setSites([]));
  }, [isMaster]);

  const devices = useMemo(() => sortDevices(data.devices), [data.devices]);
  const newest = useMemo(
    () => data.devices.reduce((best, d) => (d.appVersion && (!best || compareVersions(d.appVersion, best) > 0) ? d.appVersion : best), null),
    [data.devices]
  );
  const siteChips = useMemo(() => {
    const m = new Map();
    let unassigned = false;
    data.devices.forEach((d) => (d.siteId == null ? (unassigned = true) : m.set(String(d.siteId), d.siteName)));
    return { sites: [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))), unassigned };
  }, [data.devices]);
  const showChips = siteChips.sites.length + (siteChips.unassigned ? 1 : 0) > 1;
  const shown = devices.filter((d) =>
    siteFilter === "" ? true : siteFilter === "none" ? d.siteId == null : String(d.siteId) === siteFilter
  );

  const saveRename = async () => {
    setBusy(true);
    try {
      await renameDevice(renaming.id, renaming.value.trim());
      setRenaming(null);
      setNotice({ kind: "ok", text: t("devices.renamed") });
      await load();
    } catch (err) {
      setNotice({ kind: "bad", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const confirmAssign = async () => {
    setBusy(true);
    try {
      const res = await assignDeviceSite(assigning.id, Number(assigning.siteId));
      setAssigning(null);
      setNotice({ kind: "ok", text: t("devices.assigned", { count: res.moved ?? 0 }) });
      await load();
    } catch (err) {
      setNotice({ kind: "bad", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const stats = data.stats || { devices: 0, healthy: 0, waiting: 0, failed: 0, silent: 0 };

  const renderRow = (d) => {
    const hk = d.health?.key || "off";
    const isRenaming = renaming?.id === d.id;
    const isAssigning = assigning?.id === d.id;
    return (
      <React.Fragment key={d.id}>
        <tr className={hk === "bad" ? "row-bad" : hk === "warn" ? "row-warn" : ""}>
          <td>
            {isRenaming ? (
              <div className="ut-inline-edit">
                <input
                  className="ut-input" autoFocus value={renaming.value} maxLength={255}
                  aria-label={t("devices.renameLabel")} placeholder={d.installationId}
                  onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(null); }}
                />
                <button type="button" className="ut-btn ut-btn-primary ut-btn-sm" disabled={busy} onClick={saveRename}>{t("common.save")}</button>
                <button type="button" className="ut-btn ut-btn-ghost ut-btn-sm" onClick={() => setRenaming(null)}>{t("common.cancel")}</button>
              </div>
            ) : (
              <div className="stack">
                <span className="main">{displayName(d)}</span>
                {d.label && <span className="sub ut-mono">{d.installationId}</span>}
              </div>
            )}
          </td>
          <td>
            {d.siteName || (
              <div className="stack">
                <span className="ut-muted">{t("devices.noSite")}</span>
                {isMaster && (
                  <button type="button" className="ut-btn ut-btn-ghost ut-btn-sm"
                    onClick={() => { setNotice(null); setAssigning({ id: d.id, siteId: "", confirm: false }); }}>{t("devices.assign")}</button>
                )}
              </div>
            )}
          </td>
          <td><span className={`ut-pill ${hk}`}><span className="dot" />{t(`health.${hk}`, { defaultValue: d.health?.label })}</span></td>
          <td>
            <div className="stack"><span>{rel(d.lastSeenAt, t)}</span>{d.lastSeenAt && <span className="sub ut-num">{fmtDT(d.lastSeenAt, i18n.language)}</span>}</div>
          </td>
          <td>
            <div className="stack"><span>{rel(d.lastUpload, t)}</span>{d.lastUpload && <span className="sub ut-num">{fmtDT(d.lastUpload, i18n.language)}</span>}</div>
          </td>
          <td className="r ut-num">{d.uploads30}</td>
          {d.backlogHidden ? (
            <td className="r ut-muted" colSpan={2} title={t("devices.hiddenHint")}>{t("devices.hidden")}</td>
          ) : (
            <>
              <td className="r ut-num">{d.pending ? <span className="ut-warn-text">{d.pending}</span> : "0"}</td>
              <td className="r ut-num">{d.failed ? <span className="ut-bad-text">{d.failed}</span> : "0"}</td>
            </>
          )}
          <td>
            {d.appVersion || ""}
            {d.appVersion && newest && compareVersions(d.appVersion, newest) < 0 && <> <span className="ut-tag warn">{t("devices.old")}</span></>}
          </td>
          <td>
            <div className="stack"><span>{rel(d.lastConfigAt, t)}</span>{d.lastConfigVersion && <span className="sub ut-mono">{d.lastConfigVersion}</span>}</div>
          </td>
          <td>
            <div className="ut-actions">
              {d.siteId != null && (
                <Link className="ut-icon-btn" to={`/admin/uploads?site=${d.siteId}`} title={t("devices.showUploads")} aria-label={t("devices.showUploads")}>📤</Link>
              )}
              {isMaster && (
                <button type="button" className="ut-icon-btn light" title={t("devices.rename")} aria-label={t("devices.rename")}
                  onClick={() => { setNotice(null); setRenaming({ id: d.id, value: d.label || "" }); }}>✏️</button>
              )}
            </div>
          </td>
        </tr>
        {isAssigning && (
          <tr>
            <td colSpan={11}>
              <div className="ut-inline-edit" style={{ flexWrap: "wrap" }}>
                <label className="ut-field">
                  <span>{t("devices.assignTo")}</span>
                  <select value={assigning.siteId} onChange={(e) => setAssigning({ ...assigning, siteId: e.target.value, confirm: false })}>
                    <option value="">{t("devices.pickSite")}</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                {!assigning.confirm ? (
                  <button type="button" className="ut-btn ut-btn-primary ut-btn-sm" disabled={!assigning.siteId}
                    onClick={() => setAssigning({ ...assigning, confirm: true })}>{t("devices.assign")}</button>
                ) : (
                  <div className="ut-note warn" role="alert">
                    <span>{t("devices.assignConfirm", { device: displayName(d), site: sites.find((s) => String(s.id) === String(assigning.siteId))?.name })}</span>
                    <button type="button" className="ut-btn ut-btn-primary ut-btn-sm" disabled={busy} onClick={confirmAssign}>{t("devices.assignYes")}</button>
                  </div>
                )}
                <button type="button" className="ut-btn ut-btn-ghost ut-btn-sm" onClick={() => setAssigning(null)}>{t("common.cancel")}</button>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="dashboard-page ut-scope">
      <DashboardTopBar onBack={() => navigate("/admin/uploads")} />
      <div className="ut-wide">
        <div className="page-header">
          <h1 className="page-title">{t("devices.title")}</h1>
          <p className="project-description">{t("devices.description")}</p>
        </div>

        {error && <div className="ut-note bad" role="alert">{error}</div>}
        {notice && <div className={`ut-note ${notice.kind}`} role="status">{notice.text}</div>}

        <section className="ut-card">
          <h2 className="ut-stats-title">{t("devices.stats.title")}</h2>
          <div className="ut-stats">
            <div className="ut-stat"><span className="v">{stats.devices}</span><span className="l">{t("devices.stats.devices")}</span></div>
            <div className="ut-stat"><span className="v ok">{stats.healthy}</span><span className="l">{t("devices.stats.healthy")}</span></div>
            <div className="ut-stat"><span className="v warn">{stats.waiting}</span><span className="l">{t("devices.stats.waiting")}</span></div>
            <div className="ut-stat"><span className="v bad">{stats.failed}</span><span className="l">{t("devices.stats.failed")}</span></div>
            <div className="ut-stat"><span className="v bad">{stats.silent}</span><span className="l">{t("devices.stats.silent")}</span></div>
          </div>
        </section>

        <section className="ut-card">
          <div className="ut-section-head">
            <h2 className="ut-section-title">{t("devices.all")}</h2>
            {showChips && (
              <div className="ut-chips">
                <span className="ut-chips-label">{t("devices.site")}</span>
                <button type="button" className="ut-chip" aria-pressed={siteFilter === ""} onClick={() => setSiteFilter("")}>{t("devices.allSites")}</button>
                {siteChips.sites.map(([id, name]) => (
                  <button key={id} type="button" className="ut-chip" aria-pressed={siteFilter === id} onClick={() => setSiteFilter(id)}>{name}</button>
                ))}
                {siteChips.unassigned && (
                  <button type="button" className="ut-chip" aria-pressed={siteFilter === "none"} onClick={() => setSiteFilter("none")}>{t("devices.noSite")}</button>
                )}
              </div>
            )}
          </div>
          <div className="ut-table-wrap">
            <table className="ut-table">
              <thead>
                <tr>
                  <th>{t("devices.col.device")}</th><th>{t("devices.col.site")}</th><th>{t("devices.col.health")}</th>
                  <th>{t("devices.col.lastCheckin")}</th><th>{t("devices.col.lastUpload")}</th>
                  <th className="r">{t("devices.col.uploads30")}</th><th className="r">{t("devices.col.waiting")}</th>
                  <th className="r">{t("devices.col.failed")}</th><th>{t("devices.col.app")}</th>
                  <th>{t("devices.col.config")}</th><th />
                </tr>
              </thead>
              <tbody>
                {shown.length ? shown.map(renderRow) : (
                  <tr className="empty"><td colSpan={11}>{loading ? t("common.loading") : t("devices.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="ut-legend">
            {["ok", "warn", "bad", "off"].map((k) => (
              <span key={k}><span className={`ut-pill ${k}`}><span className="dot" />{t(`devices.legend.${k}.name`)}</span> {t(`devices.legend.${k}.text`)}</span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
