// src/components/ProtocolEditor/ProtocolForm.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import ProtocolLanguageSelector from "../ProtocolLanguageSelector/ProtocolLanguageSelector";
import FileNameModal from "./FileNameModal";
import { getAllParams, getResolvedParams, translateTaskName } from "../../utils/translations";
import {
  DEFAULT_RECORDINGS_FILE_NAME,
  normalizeIdentifiers,
  renderFileNameExample,
} from "../Identifiers/IdentifierFields";

export default function ProtocolForm({
  tasks,
  protocolData,
  setProtocolData,
  reorderMode,
  setReorderMode,
  onEdit,
  onDelete,
  onAddQuestionnaire,
  onSave,
  onShowProtocol,
  onDragStart,
  onDrop,
  dragIndex,
  validation,
  editingMode,
  onEditInfo,
  onDeleteInfo,
  onEditInstructions,
  onDeleteInstructions,
  onEditIdentifiers,
}) {
  const { t } = useTranslation(["admin", "tasks", "common"]);
  const [showFileNameModal, setShowFileNameModal] = useState(false);

  const identifiers = normalizeIdentifiers(protocolData?.required_identifiers);
  const fileNameTemplate = protocolData?.recordings_file_name || DEFAULT_RECORDINGS_FILE_NAME;
  const identifierLabel = (f) =>
    f.catalogue ? t(`identifiers.catalogue.${f.name}.label`, { ns: "common" }) : f.label || f.name;

  const handleLanguageChange = (lang) => {
    setProtocolData((prev) => ({ ...prev, language: lang }));
  };

  const handleNameChange = (e) => {
    if (editingMode) return; 
    const name = e.target.value;
    setProtocolData((prev) => ({ ...prev, name }));
  };

  const handleDescriptionChange = (e) => {
    const description = e.target.value;
    setProtocolData((prev) => ({ ...prev, description }));
  };

  // Helper to check if Quill content is truly empty
  const isQuillEmpty = (content) => {
    if (!content) return true;
    // Strip HTML tags and check if the remaining text is just whitespace
    const plainText = content.replace(/<(.|\n)*?>/g, '').trim();
    return plainText.length === 0;
  };

  return (
    <div className="protocol-section">
      <div className="protocol-header">
          <h3 className="protocol-current">
            {t("protocolEditor.currentProtocol")}
          </h3>

          <div className="protocol-values">
            <div className="protocol-field">
              <label className="protocol-label">
                {t("protocolDashboard.namePlaceholder")}:
              </label>
              <input
                type="text"
                className={`protocol-name-input ${validation.errors.name ? "name-input-error" : ""}`}
                placeholder={t("protocolDashboard.namePlaceholder")}
                value={protocolData?.name || ""}
                onChange={handleNameChange}
                disabled={editingMode || reorderMode} 
              />
              {validation.errors.name && (
                <div className="error-text">
                  {t(`validation.protocol.${validation.errors.name}`)}
                </div>
              )}
            </div>
            
            <div className="protocol-field">
              <label className="protocol-label">
                {t("protocolDashboard.descriptionPlaceholder")}:
              </label>
              <textarea
                className="protocol-description-input"
                placeholder={t(
                  "protocolDashboard.descriptionPlaceholder"
                )}
                value={protocolData?.description || ""}
                onChange={handleDescriptionChange}
                disabled={reorderMode}
              />
            </div>

            {/* Identifiers the examiner fills in, edited in the modal */}
            {identifiers.length > 0 && (
              <div className="protocol-field">
                <label className="protocol-label">
                  {t("protocolEditor.editIdentifiersTitle")}:
                </label>
                <table className="identifiers-summary">
                  <thead>
                    <tr>
                      <th>{t("protocolEditor.identifiers.label")}</th>
                      <th>{t("protocolEditor.identifiers.variable")}</th>
                      <th>{t("protocolEditor.identifiers.required")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {identifiers.map((f, idx) => (
                      <tr key={f.name || idx}>
                        <td>{identifierLabel(f)}</td>
                        <td><code>{f.name}</code></td>
                        <td>{f.required ? "✔" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Desktop-app fields: clip filename template + manual PDF URL */}
            <div className="protocol-field">
              <label className="protocol-label">
                {t("protocolEditor.recordingsFileName")}:
              </label>
              <div className="file-name-summary">
                <button
                  className="btn-file-name"
                  onClick={() => setShowFileNameModal(true)}
                  disabled={reorderMode}
                >
                  🏷️ {t("protocolEditor.fileName.button")}
                </button>
                <code className={validation.errors.recordings_file_name ? "error-text" : ""}>
                  {fileNameTemplate}
                </code>
                <small className="text-muted">
                  {t("protocolEditor.fileName.example")}: {renderFileNameExample(fileNameTemplate, identifiers)}
                </small>
              </div>
              {validation.errors.recordings_file_name && (
                <div className="error-text">
                  {t(`validation.protocol.${validation.errors.recordings_file_name}`)}
                </div>
              )}
            </div>

            <div className="protocol-field">
              <label className="protocol-label">
                {t("protocolEditor.instructionsPdfUrl")}:
              </label>
              <input
                type="url"
                className={`protocol-name-input ${validation.errors.instructions_pdf_url ? "name-input-error" : ""}`}
                placeholder="https://"
                value={protocolData?.instructions_pdf_url || ""}
                onChange={(e) => setProtocolData((prev) => ({ ...prev, instructions_pdf_url: e.target.value }))}
                disabled={reorderMode}
              />
              {validation.errors.instructions_pdf_url && (
                <div className="error-text">
                  {t(`validation.protocol.${validation.errors.instructions_pdf_url}`)}
                </div>
              )}
            </div>

            <ProtocolLanguageSelector
              value={protocolData?.language || "en"}
              onChange={handleLanguageChange}
              disabled={reorderMode}
              editingMode={editingMode}
            />

            <div className="protocol-pages-row">
              {/* Info Page Logic */}
              {isQuillEmpty(protocolData?.info_text) ? (
                <button className="btn-add-page-minimal" onClick={onEditInfo} disabled={reorderMode}>
                  + {t("protocolEditor.addInfoPage")}
                </button>
              ) : (
                <div className="page-item-minimal">
                  <span className="page-label">{t("protocolEditor.introPageAdded")} ✅</span>
                  <div className="page-actions">
                    <span className="edit-icon-small" title="Edit" onClick={reorderMode ? null : onEditInfo}>✎</span>
                    <span className="delete-icon-small" title="Delete" onClick={reorderMode ? null : onDeleteInfo}>✖</span>
                  </div>
                </div>
              )}

              {/* Instructions Page Logic */}
              {isQuillEmpty(protocolData?.instructions_text) ? (
                <button className="btn-add-page-minimal" onClick={onEditInstructions} disabled={reorderMode}>
                  + {t("protocolEditor.addInstructionsPage", "Add Instructions")}
                </button>
              ) : (
                <div className="page-item-minimal">
                  <span className="page-label">{t("protocolEditor.instructionsAdded", "Instructions Added")} ✅</span>
                  <div className="page-actions">
                    <span className="edit-icon-small" title="Edit" onClick={reorderMode ? null : onEditInstructions}>✎</span>
                    <span className="delete-icon-small" title="Delete" onClick={reorderMode ? null : onDeleteInstructions}>✖</span>
                  </div>
                </div>
              )}
            </div>
            {validation.errors.identifiers && (
              <div className="error-text">
                {t(`validation.protocol.${validation.errors.identifiers}`)}
              </div>
            )}
          </div>

          <div className="button-block">
            <button className="btn-add-questionnaire" onClick={onAddQuestionnaire} disabled={reorderMode}>
              📋{t("protocolEditor.addQuestionnaire")}
            </button>

            <button
              className={`reorder-btn ${reorderMode ? "active" : ""}`}
              onClick={() => setReorderMode(!reorderMode)}
            >
              {reorderMode ? t("protocolEditor.finishReordering") : `🔁 ${t("protocolEditor.reorderTasks")}`}
            </button>

            <button
              className="btn-identifiers"
              onClick={onEditIdentifiers}
              title={t("protocolEditor.editIdentifiersTitle")}
              disabled={reorderMode}
            >
              🪪 {t("protocolEditor.identifiersButton")}
              {identifiers.length > 0 && ` (${identifiers.length})`}
            </button>

          </div>
      </div>

      {/* --- Recording file name template modal --- */}
      <FileNameModal
        open={showFileNameModal}
        template={fileNameTemplate}
        identifiers={identifiers}
        onClose={() => setShowFileNameModal(false)}
        onSave={(tpl) => {
          setProtocolData((prev) => ({ ...prev, recordings_file_name: tpl }));
          setShowFileNameModal(false);
        }}
      />

      {/* --- Version warning --- */}
      {editingMode && (
        <div className="version-warning">
          {t("protocolEditor.versionWarning", { name: protocolData?.name || "" })}
        </div>
      )}

      <ul className="protocol-list">
        {tasks.length === 0 ? (
          <li className={`empty-protocol ${validation.errors.tasks ? "tasks-error" : ""}`}>
            <em>
              {validation.errors.tasks 
                ? t(`validation.protocol.${validation.errors.tasks}`) // Show "At least one task must be added"
                : t("protocolEditor.noTasks")
              }
            </em>
          </li>
        ) : (
          tasks.map((task, idx) => {
            const params = getAllParams(task.category);
            const resolved = getResolvedParams(task.category, task);

            return (
              <li
                key={idx}
                draggable={reorderMode}
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className={`protocol-item ${dragIndex === idx ? "dragging" : ""}`}
              >
                <div className="protocol-row">
                  <div className="task-title">
                    {idx + 1}. {translateTaskName(task.category)}
                  </div>
                  {!reorderMode && (
                    <div className="action-buttons">
                      <span className="edit-icon" title={t("protocolEditor.tooltips.edit")} onClick={() => onEdit(idx)}>✎</span>
                      <span className="delete-icon" title={t("protocolEditor.tooltips.delete")} onClick={() => onDelete(idx)}>✖</span>
                    </div>
                  )}
                </div>
                <div className="param-inline">
                  {Object.entries(params).map(([key, p], i) => {
                    // Skip rendering the full questions array in the small list view
                    if (key === 'questions') return null; 

                    let resolvedVal = resolved[key] ?? task[key];
                    if (typeof resolvedVal === "boolean") resolvedVal = String(resolvedVal);
                    // Handle multiple values selection for the UI Summary
                    if (Array.isArray(resolvedVal)) {
                      // Extract just the 'label' from the objects and join them with commas
                      resolvedVal = resolvedVal
                        .map(v => typeof v === 'object' ? v.label || v.topicDescription : v)
                        .join("; ");
                  }
                    return (
                      <span key={key}>
                        {i > 0 && " • "}
                        <strong>{p.label}: </strong> <em>{resolvedVal}</em>
                      </span>
                    );
                  })}
                  {/* Manually show question count if needed */}
                  {task.questions?.length > 0 && (
                    <span> • <strong>{t("questionnaire.params.questions.label", { ns: "tasks" })}:</strong> <em>{task.questions.length}</em></span>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className="button-row">
        <button
          className="button-show-tasks"
          onClick={() => onShowProtocol()}
          disabled={!tasks.length || reorderMode}
        >
          {t("protocolEditor.showProtocol")}
        </button>
        
        <button 
          className="button-save" 
          onClick={() => onSave()} 
          disabled={!validation.isValid || reorderMode}
        >
          {t("protocolEditor.saveProtocol")}
        </button>
      </div>
    </div>
  );
}
