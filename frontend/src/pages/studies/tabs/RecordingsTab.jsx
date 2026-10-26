// src/pages/studies/tabs/RecordingsTab.jsx — the recordings table pinned to this study.
import React from "react";
import RecordingsTable from "../../../components/Recordings/RecordingsTable";

export default function RecordingsTab({ study }) {
  return (
    <div data-testid="study-recordings">
      <RecordingsTable fixed={{ study: study.project_id }} syncUrl={false} />
    </div>
  );
}
