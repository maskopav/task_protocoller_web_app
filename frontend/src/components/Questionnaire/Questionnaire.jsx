import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./Questionnaire.css";

export default function Questionnaire({ data, onNextTask, onLogAnswer }) {
  const { t } = useTranslation(["common"]);
  const [answers, setAnswers] = useState({});
  const [isValid, setIsValid] = useState(false);

  // --- 1. Handle Input Changes ---
  const handleChange = (questionId, value, type) => {
    setAnswers((prev) => {
      // Handle Multiple Choice (Checkboxes)
      if (type === "multiple") {
        const current = prev[questionId] || [];
        if (current.includes(value)) {
          return { ...prev, [questionId]: current.filter((v) => v !== value) };
        } else {
          return { ...prev, [questionId]: [...current, value] };
        }
      }
      // Handle Single Value Types (Text, Radio, Dropdown)
      return { ...prev, [questionId]: value };
    });
    // LOG IMMEDIATELY (What answer and when)
    if (onLogAnswer) {
      onLogAnswer(questionId, value);
    }
  };

  // --- 2. Validation Effect ---
  useEffect(() => {
    if (!data || !data.questions) return;

    const allAnswered = data.questions.every((q) => {
      const val = answers[q.id];

      // Check based on type
      if (q.type === "multiple") {
        return Array.isArray(val) && val.length > 0;
      }
      if (q.type === "open") {
        return typeof val === "string" && val.trim().length > 0;
      }
      // For single/dropdown/radio, just check if value exists
      return val !== undefined && val !== "" && val !== null;
    });

    setIsValid(allAnswered);
  }, [answers, data]);

  // --- 3. Submission ---
  const handleSubmit = () => {
    if (!isValid) return;

    const result = {
      taskType: "questionnaire",
      timestamp: new Date().toISOString(),
      answers: answers,
    };

    onNextTask(result);
  };

  if (!data || !data.questions) return null;

  return (
    <div className="questionnaire-container">
      {/* Header */}
      <div className="questionnaire-header-section">
        <h2>{data.title}</h2>
        {data.instructions && (
          <p className="questionnaire-instructions">{data.instructions}</p>
        )}
      </div>

      {/* Questions List */}
      <div className="questions-list">
        {data.questions.map((q, index) => (
          <div key={q.id} className="question-card">
            <div className="question-header">
              <span className="question-number">{index + 1}.</span>
              <h4 className="question-text">{q.text}</h4>
              <span className="question-required">
                {t("questionnaire.required")}
              </span>
            </div>

            <div className="answer-area">
              {/* --- OPEN ANSWER --- */}
              {q.type === "open" && (
                <textarea
                  className="answer-input-text"
                  rows={3}
                  placeholder={t("questionnaire.typeAnswer")}
                  value={answers[q.id] || ""}
                  onChange={(e) => handleChange(q.id, e.target.value, "open")}
                />
              )}

              {/* --- SINGLE CHOICE (RADIO) --- */}
              {q.type === "single" && (
                <div className="options-group">
                  {q.options?.map((opt, i) => (
                    <label key={i} className="option-label">
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleChange(q.id, opt, "single")}
                      />
                      <span className="option-text">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* --- MULTIPLE CHOICE (CHECKBOX) --- */}
              {q.type === "multiple" && (
                <div className="options-group">
                  {q.options?.map((opt, i) => (
                    <label key={i} className="option-label">
                      <input
                        type="checkbox"
                        name={`q-${q.id}`}
                        value={opt}
                        checked={(answers[q.id] || []).includes(opt)}
                        onChange={() => handleChange(q.id, opt, "multiple")}
                      />
                      <span className="option-text">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* --- DROPDOWN --- */}
              {q.type === "dropdown" && (
                <select
                  className="answer-select"
                  value={answers[q.id] || ""}
                  onChange={(e) =>
                    handleChange(q.id, e.target.value, "dropdown")
                  }
                >
                  <option value="" disabled>
                    -- {t("questionnaire.selectOption")} --
                  </option>
                  {q.options?.map((opt, i) => (
                    <option key={i} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Submit */}
      <div className="questionnaire-footer">
        <button
          className="btn-submit-questionnaire"
          onClick={handleSubmit}
          disabled={!isValid}
          title={!isValid ? t("questionnaire.required") : ""}
        >
          {t("buttons.next")}
        </button>
      </div>
    </div>
  );
}