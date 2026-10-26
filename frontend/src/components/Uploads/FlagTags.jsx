import React from "react";
import { ISSUE_TONE } from "./format";
import useUploadLabels from "./useUploadLabels";
import { Badge } from "../ui/Badge.jsx";
import "./pills.css";

/**
 * The session's flags (row.issues) as small badges with a hint tooltip.
 * `max` shows at most that many and folds the rest into a "+n" badge (its title lists them).
 */
export default function FlagTags({ issues = [], max }) {
  const L = useUploadLabels();
  const shown = max != null ? issues.slice(0, max) : issues;
  const rest = max != null ? issues.slice(max) : [];
  return (
    <span className="uploads-tags">
      {shown.map((k) => (
        <Badge key={k} tone={ISSUE_TONE[k] || "neutral"} title={L.issueHint(k)}>{L.issue(k)}</Badge>
      ))}
      {rest.length > 0 && <Badge tone="outline" title={rest.map((k) => L.issue(k)).join(", ")}>+{rest.length}</Badge>}
    </span>
  );
}
