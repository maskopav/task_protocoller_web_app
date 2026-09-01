// src/components/Fieldwork/FieldworkImportModal.jsx
import React, { useRef, useState } from "react";
import Modal from "../ProtocolEditor/Modal";
import { parseImportCsv, downloadImportTemplate } from "./csvImport";
import { importLinkSentDates } from "../../api/participantProtocols";

const INITIAL_STATE = { status: "idle", parseErrors: [], result: null, error: "" };

// Lets a survey agency upload a CSV of "which respondent got their link
// when" (external_id, sent_at), matched against this project's participants.
// Reports success/failure per row rather than all-or-nothing, since agency
// CSVs routinely carry a handful of typo'd IDs or malformed dates.
export default function FieldworkImportModal({ open, onClose, projectId, onImported }) {
  const [state, setState] = useState(INITIAL_STATE);
  const fileInputRef = useRef(null);

  const reset = () => {
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { rows, errors: parseErrors } = parseImportCsv(text);

    if (rows.length === 0) {
      setState({ status: "idle", parseErrors, result: null, error: parseErrors.length ? "" : "No rows found in the file." });
      return;
    }

    setState({ status: "importing", parseErrors, result: null, error: "" });
    try {
      const result = await importLinkSentDates(projectId, rows);
      setState({ status: "done", parseErrors, result, error: "" });
      if (result.updated > 0) onImported();
    } catch (err) {
      setState({ status: "idle", parseErrors, result: null, error: err.message || "Import failed" });
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Link-Sent Dates" showSaveButton={false}>
      <div className="fieldwork-import">
        <p>
          Upload a CSV with the respondent ID and the date/time the link was sent to them. Rows are matched against
          this project's participants by ID.
        </p>

        <button type="button" className="fieldwork-import-template-btn" onClick={downloadImportTemplate}>
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
