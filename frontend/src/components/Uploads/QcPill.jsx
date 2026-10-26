import React from "react";
import { QC_TONE } from "./format";
import useUploadLabels from "./useUploadLabels";
import { Badge } from "../ui/Badge.jsx";
import { StatusDot } from "../ui/StatusDot.jsx";

/** Review (qc) state: unreviewed / ok / review / excluded, as a dot plus label (a badge when `big`). */
export default function QcPill({ qc, big = false }) {
  const L = useUploadLabels();
  const tone = QC_TONE[qc] || QC_TONE.unreviewed;
  if (big) {
    return (
      <Badge tone={tone === "idle" ? "neutral" : tone}>
        <StatusDot tone={tone}>{L.qc(qc)}</StatusDot>
      </Badge>
    );
  }
  return <StatusDot tone={tone}>{L.qc(qc)}</StatusDot>;
}
