import React from "react";
import { useNavigate } from "react-router-dom";
import useUploadLabels from "../useUploadLabels";
import StatusPill from "../StatusPill";
import QcPill from "../QcPill";
import FlagTags from "../FlagTags";
import { fmtDT, shortId } from "../format";
import "./UploadCards.css";

/**
 * The latest uploads (8 at most) of a site or project. `latest` is the
 * {status, data} state from useLatestUploads; `variant` picks the site-page
 * columns (project, device) or the project-page columns (site).
 */
export default function LatestUploadsTable({ latest, variant }) {
  const L = useUploadLabels();
  const { t } = L;
  const navigate = useNavigate();
  const rows = (latest?.data?.rows ?? []).slice(0, 8);
  const isSite = variant === "site";
  const cols = isSite
    ? ["received", "patient", "project", "protocol", "device", "serverCheck", "review", "flags"]
    : ["received", "site", "patient", "protocol", "serverCheck", "review", "flags"];
  const colLabel = (c) => (c === "project" || c === "site" || c === "device" ? t(`cards.latest.${c}`) : t(`columns.${c}`));
  const open = (id) => navigate(`/admin/uploads/${id}`);

  let note = null;
  if (latest?.status === "error") note = <span className="um-quiet" role="status">{t("cards.unavailable")}</span>;
  else if (!latest?.data) note = <span className="um-muted">…</span>;
  else if (rows.length === 0) note = <span className="um-muted" data-testid="latest-empty">{t("cards.latest.empty")}</span>;
  if (note) return <div className="um-table-wrap um-latest-note">{note}</div>;

  return (
    <div className="um-table-wrap" data-testid="latest-uploads">
      <table className="um-table">
        <thead><tr>{cols.map((c) => <th key={c}>{colLabel(c)}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const stripe = r.status === "invalid" ? "row-bad" : r.needsAttention ? "row-warn" : "";
            return (
              <tr key={r.id} className={`clickable ${stripe}`} tabIndex={0} onClick={() => open(r.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(r.id); }}>
                <td><div className="stack"><span className="um-num">{fmtDT(r.receivedAt)}</span><span className="cell-sub">{L.rel(r.receivedAt)}</span></div></td>
                {!isSite && <td>{r.site}</td>}
                <td className="cell-main">{r.participant?.patient_code || "—"}</td>
                {isSite && <td>{r.project}</td>}
                <td>{r.protocol}</td>
                {isSite && <td className="cell-sub">{r.deviceLabel || shortId(r.deviceId)}</td>}
                <td><StatusPill status={r.status} invalidReason={r.invalidReason} /></td>
                <td><QcPill qc={r.qc} /></td>
                <td className="flags"><FlagTags issues={r.issues} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
