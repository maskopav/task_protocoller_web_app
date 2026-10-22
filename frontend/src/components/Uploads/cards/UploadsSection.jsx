import React from "react";
import { Link } from "react-router-dom";
import useUploadLabels from "../useUploadLabels";
import { useDevices, useLatestUploads } from "./hooks";
import LatestUploadsTable from "./LatestUploadsTable";
import UploadsPerDayChart from "./UploadsPerDayChart";
import "./UploadCards.css";

function CountList({ title, items, error }) {
  const { t } = useUploadLabels();
  return (
    <div className="um-panel">
      <span className="um-label">{title}</span>
      {error ? <span className="um-quiet" role="status">{t("cards.unavailable")}</span>
        : !items ? <span className="um-muted">…</span>
        : items.length === 0 ? <span className="um-muted">—</span>
        : items.map((i) => (
          <div key={i.key} className="um-count-row"><span>{i.name}</span><strong className="um-num">{i.count}</strong></div>
        ))}
    </div>
  );
}

/** Device health for one site, with the backlog only where the server returned it. */
function SiteDevicesPanel({ siteId }) {
  const L = useUploadLabels();
  const { t } = L;
  const { status, data } = useDevices(siteId);
  const devices = data?.devices ?? [];
  return (
    <div className="um-panel" data-testid="site-devices">
      <div className="um-section-head">
        <span className="um-label">{t("cards.devices.title")}</span>
        <Link to="/admin/uploads/devices" className="um-small-link">{t("cards.devices.all")}</Link>
      </div>
      {status === "error" ? <span className="um-quiet" role="status">{t("cards.unavailable")}</span>
        : !data ? <span className="um-muted">…</span>
        : devices.length === 0 ? <span className="um-muted">{t("cards.devices.none")}</span>
        : devices.map((d) => {
          const hk = d.health?.key || "off";
          const waiting = !d.backlogHidden && d.pending > 0;
          return (
            <div key={d.id} className="um-device-row">
              <span className="um-device-name">
                <strong>{d.label || d.installationId}</strong>
                <span className="um-muted">
                  {t("cards.devices.seen", { when: d.lastSeenAt ? L.rel(d.lastSeenAt) : "—" })}
                  {waiting ? ` · ${t("cards.devices.waiting", { count: d.pending })}` : ""}
                </span>
              </span>
              <span className={`um-pill ${hk}`}><span className="um-dot" />{t(`cards.health.${hk}`, { defaultValue: d.health?.label })}</span>
            </div>
          );
        })}
    </div>
  );
}

/**
 * The "Uploads" card of the site and project pages: latest 8 uploads, the
 * per-day chart and side panels (devices for a site, protocol and site counts
 * for a project). Every block handles its own failure, so a broken endpoint
 * leaves the rest of the page untouched.
 */
export default function UploadsSection({ kind, siteId, projectId, summary, days, onDaysChange }) {
  const { t } = useUploadLabels();
  const latest = useLatestUploads({ siteId, projectId });
  const total = latest.data?.total;
  const canDownload = (latest.data?.rows ?? []).some((r) => r.canEdit);
  const viewAll = kind === "site" ? `/admin/uploads?site=${siteId}` : `/admin/uploads?project=${projectId}`;
  const sd = summary?.data;
  const sErr = summary?.status === "error";

  return (
    <section className="um-page um-embed um-section" data-testid="uploads-section">
      <div className="um-card">
        <div className="um-section-head">
          <h2 className="um-section-title">{t("cards.uploads.title")}</h2>
          <span className="um-head-actions">
            {canDownload && <Link className="um-btn um-btn-ghost um-btn-sm" to="/admin/uploads/downloads">⬇ {t("cards.latest.goToDownloads")}</Link>}
            <Link className="um-btn um-btn-primary um-btn-sm" to={viewAll}>
              {total != null ? t("cards.latest.viewAll", { count: total }) : t("cards.latest.viewAllNoCount")}
            </Link>
          </span>
        </div>
        <div className="um-section-grid">
          <LatestUploadsTable latest={latest} variant={kind} />
          <div className="um-side">
            <UploadsPerDayChart summary={summary} days={days} onDaysChange={onDaysChange} />
            {kind === "site" && <SiteDevicesPanel siteId={siteId} />}
            {kind === "project" && (
              <>
                <CountList title={t("cards.byProtocol")} error={sErr} items={sd?.byProtocol.map((p) => ({ key: p.protocol ?? "-", name: p.protocol ?? "—", count: p.count }))} />
                <CountList title={t("cards.bySite")} error={sErr} items={sd?.bySite.map((s) => ({ key: s.id, name: s.name, count: s.count }))} />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
