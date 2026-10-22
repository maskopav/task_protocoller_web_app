import React from "react";
import useUploadLabels from "../useUploadLabels";
import { useUploadSummary } from "./hooks";
import AttentionPill from "./AttentionPill";
import "./UploadCards.css";

/**
 * "Last upload 3 h ago" plus the attention pill, for a site or project card
 * on the dashboard. Shows nothing at all when the summary cannot be loaded.
 */
export default function UploadLine({ siteId, projectId }) {
  const L = useUploadLabels();
  const { status, data } = useUploadSummary({ siteId, projectId });
  if (status === "error") return null;
  return (
    <div className="um-page um-embed um-upline" data-testid="upload-line" aria-busy={!data}>
      {!data ? (
        <span className="um-muted">…</span>
      ) : data.total === 0 ? (
        <span className="um-muted">{L.t("cards.noUploads")}</span>
      ) : (
        <>
          <span>📤 {L.t("cards.lastUpload", { when: L.rel(data.lastUpload) })}</span>
          <AttentionPill count={data.attention} />
        </>
      )}
    </div>
  );
}
