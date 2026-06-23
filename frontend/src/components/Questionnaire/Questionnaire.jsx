import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "../TaskLayout/TaskLayout";
import "./Questionnaire.css";

export default function Questionnaire({ data, onNextTask, onLogAnswer }) {
  const { t } = useTranslation(["common"]);
  const [answers, setAnswers] = useState({});
  const [isValid, setIsValid] = useState(false);

  // --- 1. Handle Input Changes ---
  const handleChange = (questionId, value, type) => {
    setAnswers((prev) => {
      if (type === "multiple") {
        const current = prev[questionId] || [];
        if (current.includes(value)) {
          return { ...prev, [questionId]: current.filter((v) => v !== value) };
        } else {
          return { ...prev, [questionId]: [...current, value] };
        }
      }
      return { ...prev, [questionId]: value };
    });
    if (onLogAnswer) {
      onLogAnswer(questionId, value);
    }
  };

  // --- 2. Validation ---
  useEffect(() => {
    if (!data?.questions) return;
    const allAnswered = data.questions.every((q) => {
      const val = answers[q.id];
      if (q.type === "multiple") return Array.isArray(val) && val.length > 0;
      if (q.type === "open")     return typeof val === "string" && val.trim().length > 0;
      return val !== undefined && val !== "" && val !== null;
    });
    setIsValid(allAnswered);
  }, [answers, data]);

  // --- 3. Per-question answered check (for visual feedback) ---
  const isAnswered = (q) => {
    const val = answers[q.id];
    if (q.type === "multiple") return Array.isArray(val) && val.length > 0;
    if (q.type === "open")     return typeof val === "string" && val.trim().length > 0;
    return val !== undefined && val !== "" && val !== null;
  };

  // --- 4. Submission ---
  const handleSubmit = () => {
    if (!isValid) return;
    onNextTask({
      taskType: "questionnaire",
      timestamp: new Date().toISOString(),
      answers,
    });
  };

  if (!data?.questions) return null;

  return (
    <TaskLayout
      className="questionnaire-layout"
      title={data.title}
      mainClassName="questionnaire-main"
      controls={
        <div className="submit-control-wrapper">
          {!isValid && (
            <span className="submit-helper-text">
              {t("questionnaire.pleaseAnswerAll", "Please answer all questions to continue.")}
            </span>
          )}
          <button
            className="btn-submit-questionnaire"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            {t("buttons.next")}
          </button>
        </div>
      }
    >
      <div className="questionnaire-body">
        {data.instructions && (
          <p className="questionnaire-instructions">{data.instructions}</p>
        )}

        <div className="questions-list">
          {data.questions.map((q) => (
            <div
              key={q.id}
              className={`question-card${isAnswered(q) ? " is-answered" : ""}`}
            >
              <div className="question-header">
                <h4 className="question-text">{q.text}</h4>
              </div>

              <div className="answer-area">
                {/* OPEN */}
                {q.type === "open" && (
                  <textarea
                    className="answer-input-text"
                    rows={3}
                    placeholder={t("questionnaire.typeAnswer")}
                    value={answers[q.id] || ""}
                    onChange={(e) => handleChange(q.id, e.target.value, "open")}
                  />
                )}

                {/* SINGLE CHOICE */}
                {q.type === "single" && (
                  <div className="options-group" role="radiogroup">
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

                {/* MULTIPLE CHOICE */}
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

                {/* DROPDOWN */}
                {q.type === "dropdown" && (
                  <select
                    className="answer-select"
                    value={answers[q.id] || ""}
                    onChange={(e) => handleChange(q.id, e.target.value, "dropdown")}
                  >
                    <option value="" disabled>
                      -- {t("questionnaire.selectOption")} --
                    </option>
                    {q.options?.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TaskLayout>
  );
}