// src/components/ProtocolEditor/ProtocolForm.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import ProtocolLanguageSelector from "../ProtocolLanguageSelector";
import { getAllParams, getResolvedParams, translateTaskName } from "../../utils/translations";
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Define formatting options (bold, headers, colors, etc.)
const editorModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{'color': []}, {'background': []}],
    [{'list': 'ordered'}, {'list': 'bullet'}],
    ['clean'] // option to remove formatting
  ],
};

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
}) {
  const { t } = useTranslation(["admin", "tasks"]);

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

  const handleInfoChange = (content) => {
    setProtocolData(prev => ({ ...prev, info_text: content }));
  };

  const handleConsentChange = (content) => {
    setProtocolData(prev => ({ ...prev, consent_text: content }));
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
                disabled={editingMode} 
              />
              {validation.errors.name && (
                <div className="error-text">
                  {t(`validation.protocol.${validation.errors.name}`)}
                </div>
              )}
            </div>

            <ProtocolLanguageSelector
              value={protocolData?.language || "en"}
              onChange={handleLanguageChange}
            />


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
              />
            </div>

            <div className="protocol-field">
              <label className="protocol-label">
                {t("protocolEditor.infoPageLabel", "Additional Info (Intro Page):")}:
              </label>
              <div className="editor-container">
                <ReactQuill 
                  theme="snow"
                  value={protocolData?.info_text || ""}
                  onChange={handleInfoChange}
                  modules={editorModules}
                />
              </div>
            </div>

            <div className="protocol-field">
              <label className="protocol-label">
                {t("protocolEditor.consentPageLabel", "Consent Form Text:")}:
              </label>
              <div className="editor-container">
                <ReactQuill 
                  theme="snow"
                  value={protocolData?.consent_text || ""}
                  onChange={handleConsentChange}
                  modules={editorModules}
                />
              </div>
            </div>
          </div>

          <div className="button-block">
            <button className="btn-add-questionnaire" onClick={onAddQuestionnaire}>
              {t("protocolEditor.addQuestionnaire")}
            </button>

            <button
              className={`reorder-btn ${reorderMode ? "active" : ""}`}
              onClick={() => setReorderMode(!reorderMode)}
            >
              {reorderMode ? t("protocolEditor.finishReordering") : t("protocolEditor.reorderTasks")}
            </button>

          </div>
      </div>

      {/* --- Version warning --- */}
      {editingMode && (
        <div className="version-warning">
          ! Editing {protocolData?.name || ""} protocol: version will be incremented, protocol will be marked as current!
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

                    const resolvedVal = resolved[key] ?? task[key];
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
        <button className="button-show-tasks" onClick={onShowProtocol} disabled={!tasks.length || reorderMode}>
          {t("protocolEditor.showProtocol")}
        </button>
        <button className="button-save" 
          onClick={() => onSave()} 
          disabled={!validation.isValid || reorderMode}
        >
          {t("protocolEditor.saveProtocol")}
        </button>
      </div>
    </div>
  );
}
