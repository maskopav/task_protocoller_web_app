import React from "react";
import useUploadLabels from "../useUploadLabels";
import { fmtDT } from "../format";
import { useUploadSummary } from "./hooks";
import AttentionPill from "./AttentionPill";
import "./UploadCards.css";

/**
 * The three upload cells (Sessions / Last upload / Attention) of one row of
 * the project page's sites table: this project's uploads at this site.
 */
export default function SiteRowUploadCells({ siteId, projectId }) {
  const L = useUploadLabels();
  const { status, data } = useUploadSummary({ siteId, projectId });
  if (!data) {
    const text = status === "error" ? "—" : "…";
    return <><td className="um-muted">{text}</td><td className="um-muted">{text}</td><td className="um-muted">{text}</td></>;
  }
  return (
    <>
      <td className="um-num">{data.total}</td>
      <td>
        {data.lastUpload
          ? <div className="stack"><span>{L.rel(data.lastUpload)}</span><span className="cell-sub um-num">{fmtDT(data.lastUpload)}</span></div>
          : <span className="um-muted">—</span>}
      </td>
      <td><AttentionPill count={data.attention} /></td>
    </>
  );
}
