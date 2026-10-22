import React from "react";
import useUploadLabels from "../useUploadLabels";
import "./UploadCards.css";

/**
 * Three extra stat items (Uploads · 30 days / Invalid / Needs review) that join
 * the existing statistics card on the site and project pages. `summary` is the
 * {status, data} state from useUploadSummary.
 */
export default function UploadStats({ summary }) {
  const { t } = useUploadLabels();
  const d = summary?.data;
  const val = (v) => (d ? v : summary?.status === "error" ? "—" : "…");
  const items = [
    ["last30", d?.last30, "", "cards.stats.uploads30"],
    ["invalid", d?.invalid, "um-bad", "cards.stats.invalid"],
    ["needsReview", d?.needsReview, "um-warn", "cards.stats.needsReview"],
  ];
  return (
    <>
      {items.map(([k, v, cls, label]) => (
        <React.Fragment key={k}>
          <div className="stat-divider" />
          <div className="stat-item" data-testid={`upload-stat-${k}`}>
            <span className={`stat-value ${cls}`}>{val(v)}</span>
            <span className="stat-label">{t(label)}</span>
          </div>
        </React.Fragment>
      ))}
    </>
  );
}
