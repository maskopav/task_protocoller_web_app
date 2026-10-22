import React from "react";
import { QC_META } from "./format";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

/** Review (qc) pill: unreviewed / ok / review / excluded. */
export default function QcPill({ qc, big = false }) {
  const L = useUploadLabels();
  const m = QC_META[qc] || QC_META.unreviewed;
  return (
    <span className={`um-pill ${m.cls}${big ? " lg" : ""}`}>
      {m.icon} {L.qc(qc)}
    </span>
  );
}
