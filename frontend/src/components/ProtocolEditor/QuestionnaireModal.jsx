// src/components/ProtocolEditor/QuestionnaireModal.jsx
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import { DEFAULT_EMOJI_SCALE, EmojiFace } from "../../config/emojiRatingScale";
import "./QuestionnaireModal.css"; 

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

  const removeOption = (questionId, index) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.filter((_, i) => i !== index),
            }
          : q
      )
    );
  };

  const removeQuestion = (id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSave = () => {
    // Send flat data back to Editor
    onSave({ title, description, questions });
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
              </div>

              {/* Options Section (Moved out of flex row to stack below) */}
              {q.type !== "open" && q.type !== "rating" && (
                <div className="qm-options-section">
                   {/* ... (Options Logic Remains the Same) ... */}
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
                        <button
                          className="qm-btn-remove-option"
                          onClick={() => removeOption(q.id, i)}
                          title="Remove option"
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    <button className="qm-btn-add-option" onClick={() => addOption(q.id)}>
                      + {t("protocolEditor.questionnaire.addOption")}
                    </button>
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
                    {DEFAULT_EMOJI_SCALE.map((item) => (
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