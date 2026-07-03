import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "../TaskLayout/TaskLayout";
import { DEFAULT_EMOJI_SCALE, EmojiFace } from "../../config/emojiRatingScale";
import "./Questionnaire.css";

export default function Questionnaire({ data, onNextTask, onLogAnswer, isUploading }) {
  const { t } = useTranslation(["common"]);
  const [answers, setAnswers] = useState({});
  const [isValid, setIsValid] = useState(false);

  const listRef = useRef(null);
  const lastScrolledIndex = useRef(0);

  // --- 1. Handle Input Changes ---
  const handleChange = (questionId, value, type) => {
    setAnswers((prev) => {
      if (type === "multiple") {
        // Extract the current array for this specific question, defaulting to empty
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

  // --- 2. Per-question answered check (Moved up for use in useEffects) ---
  const isAnswered = (q) => {
    const val = answers[q.id];
    if (q.type === "multiple") return Array.isArray(val) && val.length > 0;
    if (q.type === "open")     return typeof val === "string" && val.trim().length > 0;
    return val !== undefined && val !== "" && val !== null;
  };

  // --- 3. Validation ---
  useEffect(() => {
    if (!data?.questions) return;
    const allAnswered = data.questions.every((q) => isAnswered(q));
    setIsValid(allAnswered);
  }, [answers, data]);

  // --- 4. Auto-scroll to keep previous and current question visible ---
  useEffect(() => {
    if (!data?.questions || !listRef.current) return;

    // Find the first question that hasn't been answered yet
    const firstUnansweredIndex = data.questions.findIndex((q) => !isAnswered(q));

    // If all are answered, no need to scroll
    if (firstUnansweredIndex === -1) return;

    // ONLY scroll if the user has advanced to a new unanswered question
    if (firstUnansweredIndex > lastScrolledIndex.current) {
      // Target the previous question to keep both answered and next in view
      const targetIndex = firstUnansweredIndex > 0 ? firstUnansweredIndex - 1 : 0;
      const targetCard = listRef.current.children[targetIndex];
      
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
        
        // Update the ref so we don't scroll again until they reach the NEXT question
        lastScrolledIndex.current = firstUnansweredIndex;
      }
    }
  }, [answers, data]);

  // --- 5. Submission ---
  const handleSubmit = () => {
    if (!isValid || isUploading) return;
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
            disabled={!isValid || isUploading}
          >
            {isUploading ? <span className="spinner" /> : t("buttons.next")}
          </button>
        </div>
      }
    >
      <div className="questionnaire-body">
        {data.instructions && (
          <p className="questionnaire-instructions">{data.instructions}</p>
        )}

        <div className="questions-list" ref={listRef}>
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

                {/* EMOJI RATING SCALE */}
                {q.type === "rating" && (
                  <div
                    className="emoji-scale-group"
                    role="radiogroup"
                    aria-label={q.text}
                  >
                    {(q.scale || DEFAULT_EMOJI_SCALE).map((item) => {
                      const selected = answers[q.id] === item.value;
                      return (
                        <button
                          type="button"
                          key={item.value}
                          className={`emoji-scale-option${selected ? " is-selected" : ""}`}
                          style={{
                            "--emoji-color": item.color,
                            "--emoji-bg": item.bg,
                          }}
                          role="radio"
                          aria-checked={selected}
                          aria-label={t(item.labelKey, item.label)}
                          onClick={() => handleChange(q.id, item.value, "rating")}
                        >
                          <span className="emoji-scale-face" aria-hidden="true">
                            <EmojiFace color={item.color} mouthPath={item.mouthPath} />
                          </span>
                          <span className="emoji-scale-label">
                            {t(item.labelKey, item.label)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TaskLayout>
  );
}