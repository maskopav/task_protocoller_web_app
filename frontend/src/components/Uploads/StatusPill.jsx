import React from "react";
import { STATUS_TONE } from "./format";
import useUploadLabels from "./useUploadLabels";
import { Badge } from "../ui/Badge.jsx";
import { StatusDot } from "../ui/StatusDot.jsx";

/** Server-check state: valid / validating / invalid, as a dot plus label (a badge when `big`). The title shows the reason. */
export default function StatusPill({ status, invalidReason, big = false }) {
  const L = useUploadLabels();
  const tone = STATUS_TONE[status] || "idle";
  const title = status === "invalid" && invalidReason ? L.invalidReason(invalidReason) : L.statusHint(status);
  if (big) {
    return (
      <Badge tone={tone === "idle" ? "neutral" : tone} title={title}>
        <StatusDot tone={tone}>{L.status(status)}</StatusDot>
      </Badge>
    );
  }
  return <StatusDot tone={tone} title={title}>{L.status(status)}</StatusDot>;
}
