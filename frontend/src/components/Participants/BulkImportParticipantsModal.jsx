// src/components/Participants/BulkImportParticipantsModal.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { bulkImportParticipants } from "../../api/participants";
import Modal from "../ProtocolEditor/Modal";
import "./AddParticipantModal.css";

// Triggers a browser download of the result CSV without navigating away
// from the dashboard (apiFetch already gave us a Blob, not a URL to visit).
function downloadCsv(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "participants-import-result.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportParticipantsModal({ open, onClose, projectId, protocols, onSuccess }) {
  const { t } = useTranslation(["admin", "common"]);

  const [protocolId, setProtocolId] = useState("");
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const reset = () => {
    setProtocolId("");
    setFile(null);
    setSubmitError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!protocolId || !file) return;
    setSubmitError("");
    setIsSubmitting(true);
    try {
      const csvBlob = await bulkImportParticipants(projectId, protocolId, file);
      downloadCsv(csvBlob);
      onSuccess();
      handleClose();
    } catch (err) {
      setSubmitError(t("participantDashboard.bulkImport.error") + ": " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = !!protocolId && !!file;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("participantDashboard.bulkImport.title")}
      showSaveButton={false}
    >
      <div className="participant-form">
        <p className="participant-instruction">
          {t("participantDashboard.bulkImport.instruction")}
        </p>

        <div className="form-col select-container">
          <label className="form-label">
            {t("participantDashboard.modal.labels.protocol")}
            <span className="label-required">*</span>
          </label>
          <select
            className={`participant-input select ${protocolId ? "valid" : ""}`}
            value={protocolId}
            onChange={(e) => setProtocolId(e.target.value)}
          >
            <option value="">{t("participantDashboard.modal.placeholders.selectProtocol")}</option>
            {protocols.map((proto) => (
              <option key={proto.id} value={proto.id}>
                {proto.name} (v{proto.version})
              </option>
            ))}
          </select>
        </div>

        <div className="form-col">
          <label className="form-label">
            {t("participantDashboard.bulkImport.labels.file")}
            <span className="label-required">*</span>
          </label>
          <input
            className="participant-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </div>

        <div className="error-container" style={{ minHeight: "1.2em", marginTop: "0.5rem" }}>
          {submitError && <div className="validation-error-msg">{submitError}</div>}
        </div>

        <div className="modal-actions">
          <button
            className="btn-save"
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
            style={{ opacity: !isFormValid || isSubmitting ? 0.5 : 1, cursor: !isFormValid || isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting
              ? t("participantDashboard.bulkImport.buttons.importing")
              : t("participantDashboard.bulkImport.buttons.import")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
