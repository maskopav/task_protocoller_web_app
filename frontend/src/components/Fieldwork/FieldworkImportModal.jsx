// src/components/Fieldwork/FieldworkImportModal.jsx
import React, { useRef, useState } from "react";
import Modal from "../ProtocolEditor/Modal";
import { parseImportCsv, downloadImportTemplate } from "./csvImport";
import { importContactEvents } from "../../api/participantProtocols";

// What a survey agency can log per respondent via this importer: the
// initial link send, and up to 3 follow-up calls (each with notes) — mirrors
// participant_protocol_contacts' (contact_type, attempt_number) key.
const IMPORT_TARGETS = {
  link_sent: { contactType: "link_sent", attemptNumber: 1, label: "Link sent date", withNotes: false },
  call_1: { contactType: "call", attemptNumber: 1, label: "Call 1", withNotes: true },
  call_2: { contactType: "call", attemptNumber: 2, label: "Call 2", withNotes: true },
  call_3: { contactType: "call", attemptNumber: 3, label: "Call 3", withNotes: true },
};

const INITIAL_STATE = { status: "idle", parseErrors: [], result: null, error: "" };

// Lets a survey agency upload a CSV logging one outreach touchpoint per
// respondent (which link-send or call, when, and — for calls — notes),
// matched against this project's participants by ID. Reports success/
// failure per row rather than all-or-nothing, since agency CSVs routinely
// carry a handful of typo'd IDs or malformed dates.
export default function FieldworkImportModal({ open, onClose, projectId, onImported }) {
  const [targetKey, setTargetKey] = useState("link_sent");
  const [state, setState] = useState(INITIAL_STATE);
  const fileInputRef = useRef(null);
  const target = IMPORT_TARGETS[targetKey];

  const reset = () => {
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTargetChange = (e) => {
    setTargetKey(e.target.value);
    reset();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { rows, errors: parseErrors } = parseImportCsv(text, { withNotes: target.withNotes });

    if (rows.length === 0) {
      setState({ status: "idle", parseErrors, result: null, error: parseErrors.length ? "" : "No rows found in the file." });
      return;
    }

    setState({ status: "importing", parseErrors, result: null, error: "" });
    try {
      const result = await importContactEvents(projectId, target.contactType, target.attemptNumber, rows);
      setState({ status: "done", parseErrors, result, error: "" });
      if (result.updated > 0) onImported();
    } catch (err) {
      setState({ status: "idle", parseErrors, result: null, error: err.message || "Import failed" });
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Outreach Data" showSaveButton={false}>
      <div className="fieldwork-import">
        <label className="fieldwork-import-file-label">
          <span>What are you importing?</span>
          <select value={targetKey} onChange={handleTargetChange} disabled={state.status === "importing"}>
            {Object.entries(IMPORT_TARGETS).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <p>
          Upload a CSV with the respondent ID and the date/time {target.withNotes ? "this call was made" : "the link was sent to them"}
          {target.withNotes ? ", plus a notes column" : ""}. Rows are matched against this project's participants by
          ID; re-uploading a corrected file simply overwrites the same {target.withNotes ? "call" : "link-sent"} entry.
        </p>

        <div className="fieldwork-import-format-help">
          <strong>Date format</strong> — always start with the year; time is optional (24-hour clock):
          <ul>
            <li><code>2026-09-01</code> — date only</li>
            <li><code>2026-09-01 14:30</code> — date + time</li>
            <li><code>2026-09-01 14:30:00</code> — date + time + seconds</li>
            <li><code>2026-09-01T14:30:00</code> — ISO 8601 ("T" separator)</li>
          </ul>
          Don't use DD/MM/YYYY or MM/DD/YYYY — that ordering is ambiguous and will be rejected.
        </div>

        <button type="button" className="fieldwork-import-template-btn" onClick={() => downloadImportTemplate(target.contactType)}>
          Download CSV template
        </button>

        <label className="fieldwork-import-file-label">
          <span>CSV file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={state.status === "importing"}
          />
        </label>

        {state.status === "importing" && <p className="fieldwork-import-status">Importing…</p>}

        {state.error && <p className="fieldwork-import-error">{state.error}</p>}

        {state.parseErrors.length > 0 && (
          <div className="fieldwork-import-warnings">
            <strong>Skipped while reading the file:</strong>
            <ul>
              {state.parseErrors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {state.result && (
          <div className="fieldwork-import-result">
            <p>
              <strong>{state.result.updated}</strong> of <strong>{state.result.total}</strong> rows updated.
            </p>
            {state.result.skipped.length > 0 && (
              <div className="fieldwork-import-warnings">
                <strong>Not updated:</strong>
                <ul>
                  {state.result.skipped.map((s, i) => (
                    <li key={i}>
                      {s.external_id || "(no ID)"} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          {state.result && (
            <button type="button" className="btn-edit" onClick={reset}>
              Import another file
            </button>
          )}
          <button type="button" className="btn-save" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
