import React from "react";
import { Link } from "react-router-dom";
import useUploadLabels from "../useUploadLabels";
import { useUploadSummary } from "./hooks";
import "./UploadCards.css";

/** Dashboard "Uploads" card: N this week, N need attention. Links to /admin/uploads. */
export default function UploadsSummaryCard({ sitesCount }) {
  const { t } = useUploadLabels();
  const { status, data } = useUploadSummary();
  return (
    <Link className="action-card um-link-card" to="/admin/uploads" data-testid="uploads-card">
      <div className="icon">📤</div>
      <div className="text">
        <h3>{t("cards.uploads.title")}</h3>
        <p>{t("cards.uploads.desc", { count: sitesCount ?? 0 })}</p>
        <div className="um-page um-embed um-badges" aria-busy={status === "loading"}>
          {status === "error" ? (
            <span className="um-quiet" role="status">{t("cards.unavailable")}</span>
          ) : !data ? (
            <span className="um-muted">…</span>
          ) : data.total === 0 ? (
            <span className="um-muted">{t("cards.noUploads")}</span>
          ) : (
            <>
              <span className="um-pill info">{t("cards.thisWeek", { count: data.week })}</span>
              <span className={`um-pill ${data.attention > 0 ? "warn" : "ok"}`}>{t("cards.needAttention", { count: data.attention })}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
