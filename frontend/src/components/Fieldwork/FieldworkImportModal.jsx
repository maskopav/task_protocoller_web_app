// src/components/Fieldwork/FieldworkImportModal.jsx
import React, { useRef, useState } from "react";
import Modal from "../ProtocolEditor/Modal";
import { IMPORT_COLUMNS, PROTOCOL_ID_COLUMN, parseImportCsv, downloadImportTemplate } from "./csvImport";
import { importContactEvents } from "../../api/participantProtocols";

const INITIAL_STATE = { status: "idle", parseErrors: [], result: null, error: "" };

// Lets the admin pick which outreach columns they're uploading this time
// (respondent ID is always included) and which delimiter their CSV uses,
// then matches rows against this project's participants by ID. Reports
// success/failure per row rather than all-or-nothing, since agency CSVs
// routinely carry a handful of typo'd IDs or malformed dates.
export default function FieldworkImportModal({ open, onClose, projectId, onImported }) {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(IMPORT_COLUMNS.map((c) => c.key)));
  const [includeProtocolId, setIncludeProtocolId] = useState(false);
  const [delimiter, setDelimiter] = useState(",");
  const [state, setState] = useState(INITIAL_STATE);
  const fileInputRef = useRef(null);
  const selectedColumns = IMPORT_COLUMNS.filter((c) => selectedKeys.has(c.key));

  const reset = () => {
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleColumn = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    reset();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { rows, errors: parseErrors } = parseImportCsv(text, { columns: selectedColumns, delimiter, includeProtocolId });

    if (rows.length === 0) {
      setState({ status: "idle", parseErrors, result: null, error: parseErrors.length ? "" : "No rows found in the file." });
      return;
    }

    setState({ status: "importing", parseErrors, result: null, error: "" });
    try {
      const result = await importContactEvents(projectId, rows);
      setState({ status: "done", parseErrors, result, error: "" });
      if (result.updated > 0) onImported();
    } catch (err) {
      setState({ status: "idle", parseErrors, result: null, error: err.message || "Import failed" });
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Outreach Data" showSaveButton={false}>
      <div className="fieldwork-import">
        <p>
          Select the columns you're uploading, download the template, fill it in, then upload it. Column names must
          match exactly. Dates: e.g. <code>2026-09-01</code> or <code>2026-09-01 14:30</code>.
        </p>

        <div className="fieldwork-import-columns">
          <label className="fieldwork-import-column-option fieldwork-import-column-fixed">
            <input type="checkbox" checked disabled />
            Respondent ID (always included)
          </label>
          {IMPORT_COLUMNS.map((col) => (
            <label key={col.key} className="fieldwork-import-column-option">
              <input type="checkbox" checked={selectedKeys.has(col.key)} onChange={() => toggleColumn(col.key)} />
              {col.label}
            </label>
          ))}
        </div>

        <label className="fieldwork-import-column-option fieldwork-import-protocol-id">
          <input
            type="checkbox"
            checked={includeProtocolId}
            onChange={() => { setIncludeProtocolId((v) => !v); reset(); }}
          />
          Include {PROTOCOL_ID_COLUMN.label} — only needed if a respondent has more than one active protocol in this
          project. Find it in the table's "Protocol ID" column (Columns menu) and copy it into this column per row.
        </label>

        <div className="fieldwork-import-delimiter">
          <span>Delimiter</span>
          <label>
            <input type="radio" name="delimiter" checked={delimiter === ","} onChange={() => { setDelimiter(","); reset(); }} />
            Comma (,)
          </label>
          <label>
            <input type="radio" name="delimiter" checked={delimiter === ";"} onChange={() => { setDelimiter(";"); reset(); }} />
            Semicolon (;)
          </label>
        </div>

        <button
          type="button"
          className="fieldwork-import-template-btn"
          onClick={() => downloadImportTemplate(selectedColumns, delimiter, includeProtocolId)}
        >
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
