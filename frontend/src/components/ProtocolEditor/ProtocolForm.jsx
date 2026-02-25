// src/components/ProtocolEditor/ProtocolForm.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import ProtocolLanguageSelector from "../ProtocolLanguageSelector";
import AdminModal from "./Modal";
import { getAllParams, getResolvedParams, translateTaskName } from "../../utils/translations";

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
  onEditIntro,
  onDeleteIntro,
  onEditConsent,
  onDeleteConsent,
}) {
  const { t } = useTranslation(["admin", "tasks"]);
  const [showRandomSettings, setShowRandomSettings] = useState(false);
  const [previewRandomized, setPreviewRandomized] = useState(true);

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

  // --- Randomization Logic ---
  const randomStrategy = protocolData?.randomization?.strategy || 'none';
  const moduleSettings = protocolData?.randomization?.moduleSettings || { shuffleBlocks: false, shuffleWithin: false };

  const handleStrategyChange = (e) => {
    const newStrategy = e.target.value;
    setProtocolData(prev => ({
      ...prev,
      randomization: {
        ...prev.randomization,
        strategy: newStrategy,
        // Reset module settings if switching away from module strategy? 
        // Optional: keeping them makes it easier if user switches back.
        moduleSettings: prev.randomization?.moduleSettings || { shuffleBlocks: false, shuffleWithin: false }
      }
    }));
  };

  const handleModuleSettingChange = (e) => {
    const { name, checked } = e.target;
    setProtocolData(prev => ({
      ...prev,
      randomization: {
        ...prev.randomization,
        moduleSettings: {
          ...prev.randomization?.moduleSettings,
          [name]: checked
        }
      }
    }));
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

            <div className="protocol-pages-row">
              {/* Intro Page Logic */}
              {isQuillEmpty(protocolData?.info_text) ? (
                <button className="btn-add-page-minimal" onClick={onEditIntro}>
                  + {t("protocolEditor.addIntroPage")}
                </button>
              ) : (
                <div className="page-item-minimal">
                  <span className="page-label">{t("protocolEditor.introPageAdded")} ✅</span>
                  <div className="page-actions">
                    <span className="edit-icon-small" title="Edit" onClick={onEditIntro}>✎</span>
                    <span className="delete-icon-small" title="Delete" onClick={onDeleteIntro}>✖</span>
                  </div>
                </div>
              )}

              {/* Consent Form Logic */}
              {isQuillEmpty(protocolData?.consent_text)? (
                <button className="btn-add-page-minimal" onClick={onEditConsent}>
                  + {t("protocolEditor.addConsentForm")}
                </button>
              ) : (
                <div className="page-item-minimal">
                  <span className="page-label">{t("protocolEditor.consentFormAdded")} ✅</span>
                  <div className="page-actions">
                    <span className="edit-icon-small" title="Edit" onClick={onEditConsent}>✎</span>
                    <span className="delete-icon-small" title="Delete" onClick={onDeleteConsent}>✖</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="button-block">
            <button className="btn-add-questionnaire" onClick={onAddQuestionnaire}>
              📋{t("protocolEditor.addQuestionnaire")}
            </button>

            <button
              className={`reorder-btn ${reorderMode ? "active" : ""}`}
              onClick={() => setReorderMode(!reorderMode)}
            >
              {reorderMode ? t("protocolEditor.finishReordering") : `🔁 ${t("protocolEditor.reorderTasks")}`}
            </button>

            <button 
              className={`btn-randomize ${randomStrategy !== 'none' ? 'active-strategy' : ''}`} 
              onClick={() => setShowRandomSettings(true)}
              title={t("protocolEditor.randomization.title")}
            >
               🎲 {t("protocolEditor.randomization.button")}
               {randomStrategy !== 'none' && <span className="strategy-badge" />}
            </button>

          </div>
      </div>

      {/* --- Randomization Settings Modal --- */}
      <AdminModal
        open={showRandomSettings}
        title={t("protocolEditor.randomization.title")}
        onClose={() => setShowRandomSettings(false)}
        onSave={() => setShowRandomSettings(false)} // Just closes, data is synced live
        showFooter={true} // Ensure we have a Close/Save button
      >
        <div className="randomization-settings">
          <h4>{t("protocolEditor.randomization.strategyLabel")}</h4>
          
          {/* Strategy: None (Strict) */}
          <label className="radio-option">
            <input 
              type="radio" 
              name="strategy" 
              value="none" 
              checked={randomStrategy === 'none'}
              onChange={handleStrategyChange}
            />
            <div className="radio-content">
              <strong>{t("protocolEditor.randomization.none")}</strong>
              <small>{t("protocolEditor.randomization.noneDesc")}</small>
            </div>
          </label>

          {/* Strategy: Global Shuffle */}
          <label className="radio-option">
            <input 
              type="radio" 
              name="strategy" 
              value="global" 
              checked={randomStrategy === 'global'}
              onChange={handleStrategyChange}
            />
            <div className="radio-content">
              <strong>{t("protocolEditor.randomization.global")}</strong>
              <small>{t("protocolEditor.randomization.globalDesc")}</small>
            </div>
          </label>

          {/* Strategy: Module Logic */}
          <label className="radio-option">
            <input 
              type="radio" 
              name="strategy" 
              value="module" 
              checked={randomStrategy === 'module'}
              onChange={handleStrategyChange}
            />
            <div className="radio-content">
              <strong>{t("protocolEditor.randomization.module")}</strong>
              <small>{t("protocolEditor.randomization.moduleDesc")}</small>
            </div>
          </label>

          {/* Sub-options for Module Logic */}
          {randomStrategy === 'module' && (
            <div className="sub-options">
              <h5>{t("protocolEditor.randomization.moduleOptions")}</h5>
              
              <label className="checkbox-option">
                <input 
                  type="checkbox" 
                  name="shuffleBlocks"
                  checked={moduleSettings.shuffleBlocks}
                  onChange={handleModuleSettingChange}
                />
                <span>
                  {t("protocolEditor.randomization.shuffleBlocks")}
                  <br/>
                  <small>{t("protocolEditor.randomization.shuffleBlocksDesc")}</small>
                </span>
              </label>

              <label className="checkbox-option">
                <input 
                  type="checkbox" 
                  name="shuffleWithin"
                  checked={moduleSettings.shuffleWithin}
                  onChange={handleModuleSettingChange}
                />
                <span>
                  {t("protocolEditor.randomization.shuffleWithin")}
                  <br/>
                  <small>{t("protocolEditor.randomization.shuffleWithinDesc")}</small>
                </span>
              </label>
            </div>
          )}
        </div>
      </AdminModal>

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
        
        {/* Only show the checkbox if a randomization strategy is active */}
        {randomStrategy !== 'none' && (
          <label className="preview-random-toggle">
            <input 
              type="checkbox" 
              checked={previewRandomized} 
              onChange={(e) => setPreviewRandomized(e.target.checked)} 
              disabled={reorderMode}
            />
            {t("protocolEditor.simulateRandomization")}
          </label>
        )}

        <button 
          className="button-show-tasks" 
          onClick={() => onShowProtocol(previewRandomized)} 
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
