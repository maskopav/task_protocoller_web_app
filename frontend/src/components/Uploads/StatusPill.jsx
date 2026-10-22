import React from "react";
import { STATUS_CLS } from "./format";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

/** Server-check pill: valid / validating / invalid (title shows the reason). */
export default function StatusPill({ status, invalidReason, big = false }) {
  const L = useUploadLabels();
  const cls = STATUS_CLS[status] || "off";
  const title = status === "invalid" && invalidReason ? L.invalidReason(invalidReason) : L.statusHint(status);
  return (
    <span className={`um-pill ${cls}${big ? " lg" : ""}`} title={title}>
      <span className="um-dot" />
      {L.status(status)}
    </span>
  );
}
