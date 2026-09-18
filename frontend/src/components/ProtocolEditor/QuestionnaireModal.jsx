// src/components/ProtocolEditor/QuestionnaireModal.jsx
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import { DEFAULT_EMOJI_SCALE, EmojiFace } from "../../config/emojiRatingScale";
import "./QuestionnaireModal.css";
import {
  getConditionSourceQuestions,
  sanitizeShowIf,
  clearDanglingShowIf,
} from "./questionConditions";

export default function QuestionnaireModal({ open, onClose, onSave, initialData }) {
  const { t } = useTranslation(["admin", "common"]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState([]);

  // Load initial data or reset
  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title || "");
      setDescription(initialData.description || "");
      setQuestions(initialData.questions || []);
    } else if (open && !initialData) {
      setTitle("");
      setDescription("");
      setQuestions([]);
    }
  }, [initialData, open]);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: "",
        type: "open",
        options: [],
        optional: false,
      },
    ]);
  };

  const updateQuestion = (id, key, value) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [key]: value } : q))
    );
  };

  // --- Option Handlers ---
  const addOption = (questionId) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, options: [...(q.options || []), ""] } : q
      )
    );
  };

  const updateOption = (questionId, index, value) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt, i) => (i === index ? value : opt)),
            }
          : q
      )
    );
  };

  const toggleFreeTextOption = (questionId, opt) =>
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const current = q.freeTextOptions || [];
        return {
          ...q,
          freeTextOptions: current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt],
        };
      })
    );

  const removeOption = (questionId, index) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const removedOpt = q.options[index];
        return {
          ...q,
          options: q.options.filter((_, i) => i !== index),
          freeTextOptions: (q.freeTextOptions || []).filter((o) => o !== removedOpt),
        };
      })
    );
  };

  const removeQuestion = (id) => {
    setQuestions((prev) => clearDanglingShowIf(prev.filter((q) => q.id !== id), id));
  };

  // --- Conditional visibility (showIf) handlers ---
  const setShowIfEnabled = (questionId, enabled) => {
    if (!enabled) {
      updateQuestion(questionId, "showIf", null);
      return;
    }
    const [firstSource] = getConditionSourceQuestions(questions, questionId);
    if (!firstSource) return;
    updateQuestion(questionId, "showIf", { questionId: firstSource.id, values: [] });
  };

  const setShowIfSource = (questionId, sourceId) => {
    updateQuestion(questionId, "showIf", { questionId: sourceId, values: [] });
  };

  const toggleShowIfValue = (questionId, value) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId || !q.showIf) return q;
        const current = q.showIf.values || [];
        const values = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...q, showIf: { ...q.showIf, values } };
      })
    );
  };

  const handleSave = () => {
    const cleaned = questions.map((q) => ({
      ...q,
      freeTextOptions: (q.freeTextOptions || []).filter((opt) => q.options.includes(opt)),
      showIf: sanitizeShowIf(q.showIf, questions),
    }));
    onSave({ title, description, questions: cleaned });
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} onSave={handleSave}>
      <div className="modal-title">{t("protocolEditor.addQuestionnaire")}</div>

      <div className="questionnaire-modal-form">
        {/* ... (Header Section Remains the Same) ... */}
        <div className="qm-header-section">
          <div className="qm-input-group">
            <label>{t("protocolEditor.questionnaire.questionnaireTitle")}</label>
            <input
              className="qm-input"
              type="text"
              value={title}
              placeholder={t("protocolEditor.questionnaire.enterTitle")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="qm-input-group">
            <label>{t("protocolEditor.questionnaire.questionnaireDescription")}</label>
            <textarea
              className="qm-textarea"
              value={description}
              placeholder={t("protocolEditor.questionnaire.enterDescription")}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="qm-questions-list">
          {questions.map((q, idx) => (
            <div key={q.id} className="qm-question-card">
              
              <div className="qm-card-header">
                <span className="qm-question-label">
                  {t("protocolEditor.questionnaire.question")} {idx + 1}
                </span>
                <button
                  className="qm-btn-remove-question"
                  onClick={() => removeQuestion(q.id)}
                  title={t("protocolEditor.questionnaire.removeQuestion")}
                >
                  ✕
                </button>
              </div>

              {/* Flex Row Container */}
              <div className="qm-card-body">
                <div className="qm-input-group">
                  <input
                    className="qm-input question-text" 
                    type="text"
                    value={q.text}
                    placeholder={t("protocolEditor.questionnaire.enterQuestionText")}
                    onChange={(e) => updateQuestion(q.id, "text", e.target.value)}
                  />
                </div>

                <div className="qm-input-group">
                  <select
                    className="qm-select type-select" 
                    value={q.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      updateQuestion(q.id, "type", newType);
                      if (newType === "open" || newType === "rating") {
                        updateQuestion(q.id, "options", []);
                      }
                    }}
                  >
                    <option value="open">{t("protocolEditor.questionnaire.Open answer")}</option>
                    <option value="single">{t("protocolEditor.questionnaire.Single choice")}</option>
                    <option value="multiple">{t("protocolEditor.questionnaire.Multiple choice")}</option>
                    <option value="dropdown">{t("protocolEditor.questionnaire.Dropdown")}</option>
                    <option value="rating">{t("protocolEditor.questionnaire.Emoji rating")}</option>
                  </select>
                </div>

                <div className="qm-input-group qm-checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={q.optional || false}
                      onChange={(e) => updateQuestion(q.id, "optional", e.target.checked)}
                    />
                    {t("protocolEditor.questionnaire.optional")}
                  </label>
                </div>

              </div>

              {/* Conditional Visibility Section */}
              {(() => {
                const sourceQuestions = getConditionSourceQuestions(questions, q.id);
                if (sourceQuestions.length === 0) return null;
                const selectedSource = q.showIf
                  ? questions.find((sq) => sq.id === q.showIf.questionId)
                  : null;
                return (
                  <div className="qm-options-section qm-condition-section">
                    <label className="qm-checkbox-group-inline">
                      <input
                        type="checkbox"
                        checked={!!q.showIf}
                        onChange={(e) => setShowIfEnabled(q.id, e.target.checked)}
                      />
                      {t("protocolEditor.questionnaire.showOnlyIf")}
                    </label>

                    {q.showIf && (
                      <div className="qm-condition-detail">
                        <select
                          className="qm-select"
                          value={q.showIf.questionId}
                          onChange={(e) => setShowIfSource(q.id, Number(e.target.value))}
                        >
                          {sourceQuestions.map((sq) => (
                            <option key={sq.id} value={sq.id}>
                              {`Q${questions.findIndex((x) => x.id === sq.id) + 1}: ${sq.text || t("protocolEditor.questionnaire.enterQuestionText")}`}
                            </option>
                          ))}
                        </select>

                        <div className="qm-condition-values">
                          {(selectedSource?.options || []).map((opt) => (
                            <label key={opt} className="qm-condition-value-option">
                              <input
                                type="checkbox"
                                checked={q.showIf.values.includes(opt)}
                                onChange={() => toggleShowIfValue(q.id, opt)}
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Options Section */}
              {q.type !== "open" && q.type !== "rating" && (
                <div className="qm-options-section">
                   <label className="qm-options-label">
                      {t("protocolEditor.questionnaire.answerOptions")}
                    </label>
                    
                    {q.options && q.options.map((opt, i) => (
                      <div key={i} className="qm-option-row">
                        <input
                          className="qm-input"
                          type="text"
                          value={opt}
                          placeholder={`${t("protocolEditor.questionnaire.Option")} ${i + 1}`}
                          onChange={(e) => updateOption(q.id, i, e.target.value)}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <input type="checkbox" checked={q.freeTextOptions?.includes(opt) ?? false}
                            onChange={() => toggleFreeTextOption(q.id, opt)} />
                          Allow write-in
                        </label>
                        <button className="qm-btn-remove-option" onClick={() => removeOption(q.id, i)} title="Remove option">✕</button>
                      </div>
                    ))}
                    <button className="qm-btn-add-option" onClick={() => addOption(q.id)}>
                      + {t("protocolEditor.questionnaire.addOption")}
                    </button>

                    {/*  Dropdown to select the exclusive option */}
                    {q.type === "multiple" && q.options.length > 0 && (
                      <div className="qm-input-group" style={{ marginTop: "1rem" }}>
                        <label>Exclusive Option (Clears other selections)</label>
                        <select
                          className="qm-select type-select"
                          value={q.exclusiveOption || ""}
                          onChange={(e) => updateQuestion(q.id, "exclusiveOption", e.target.value)}
                        >
                          <option value="">-- None --</option>
                          {q.options.map((opt, idx) => (
                            <option key={idx} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}
                </div>
              )}

              {/* Rating questions use a fixed 5-point emoji scale — nothing to configure,
                  just a preview so whoever builds the questionnaire knows what patients see */}
              {q.type === "rating" && (
                <div className="qm-options-section qm-rating-preview">
                  <label className="qm-options-label">
                    {t("protocolEditor.questionnaire.ratingPreview")}
                  </label>
                  <div className="qm-rating-preview-faces">
                    {DEFAULT_EMOJI_SCALE.slice().reverse().map((item) => (
                      <span
                        key={item.value}
                        className="qm-rating-preview-face"
                        title={t(item.labelKey, item.label)}
                      >
                        <EmojiFace color={item.color} mouthPath={item.mouthPath} />
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button className="qm-btn-add-question" onClick={addQuestion}>
          + {t("protocolEditor.questionnaire.addQuestion")}
        </button>
      </div>
    </Modal>
  );
}