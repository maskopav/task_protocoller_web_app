import React from "react";
import { ISSUE_CLS } from "./format";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

/** The session's flags (row.issues) as small tags with a hint tooltip. */
export default function FlagTags({ issues = [] }) {
  const L = useUploadLabels();
  return (
    <span className="um-tags">
      {issues.map((k) => (
        <span key={k} className={`um-tag ${ISSUE_CLS[k] ?? ""}`} title={L.issueHint(k)}>
          {L.issue(k)}
        </span>
      ))}
    </span>
  );
}
