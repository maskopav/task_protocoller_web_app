import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "../TaskLayout/TaskLayout";
import { DEFAULT_EMOJI_SCALE, EmojiFace } from "../../config/emojiRatingScale";
import "./Questionnaire.css";

export default function Questionnaire({ data, onNextTask, onLogAnswer, isUploading }) {
  const { t } = useTranslation(["common", "tasks"]);
  const [answers, setAnswers] = useState({});
  const [isValid, setIsValid] = useState(false);

  const listRef = useRef(null);
  const lastScrolledIndex = useRef(0);

  // --- 1. Handle Input Changes ---
  const handleChange = (questionId, value, type, exclusiveOptionValue = null) => {
    const question = data.questions.find((q) => q.id === questionId);
    setAnswers((prev) => {
      let nextValue;
      if (type === "multiple") {
        const current = prev[questionId] || [];
        if (value === exclusiveOptionValue && exclusiveOptionValue !== null) {
          nextValue = current.includes(value) ? [] : [value];
        } else if (current.includes(value)) {
          nextValue = current.filter((v) => v !== value);
        } else {
          nextValue = [...current.filter((v) => v !== exclusiveOptionValue), value];
        }
      } else {
        nextValue = value;
      }

      const next = { ...prev, [questionId]: nextValue };
      (question?.freeTextOptions || []).forEach((opt) => {
        const stillSelected = type === "multiple" ? nextValue.includes(opt) : nextValue === opt;
        if (!stillSelected) delete next[`${questionId}__freeText__${opt}`];
      });
      return next;
    });
    if (onLogAnswer) onLogAnswer(questionId, value);
  };

  // --- 2. Per-question answered check (Moved up for use in useEffects) ---
  const isAnswered = (q) => {
    const val = answers[q.id];
    if (q.type === "multiple" && !(Array.isArray(val) && val.length > 0)) return false;
    if (q.type === "open" && !(typeof val === "string" && val.trim().length > 0)) return false;
    if (q.type !== "multiple" && q.type !== "open" && (val === undefined || val === "" || val === null)) return false;

    if (q.freeTextOptions?.length) {
      const selected = q.freeTextOptions.filter((opt) =>
        q.type === "multiple" ? val.includes(opt) : val === opt
      );
      return selected.every((opt) => (answers[`${q.id}__freeText__${opt}`] || "").trim().length > 0);
    }
    return true;
  };

  const handleFreeTextChange = (questionId, opt, text) => {
    setAnswers((prev) => ({ ...prev, [`${questionId}__freeText__${opt}`]: text }));
    if (onLogAnswer) onLogAnswer(`${questionId}__freeText__${opt}`, text);
  };

  const renderFreeText = (q, opt, selected) =>
    q.freeTextOptions?.includes(opt) && selected && (
      <input
        type="text"
        className="answer-input-text"
        placeholder={t("questionnaire.pleaseSpecify", { ns: "common" })}
        value={answers[`${q.id}__freeText__${opt}`] || ""}
        onChange={(e) => handleFreeTextChange(q.id, opt, e.target.value)}
      />
    );

  // --- 3. Validation ---
  useEffect(() => {
    if (!data?.questions) return;
    // A question is satisfied if it is optional OR answered
    const allSatisfied = data.questions.every((q) => q.optional || isAnswered(q));
    setIsValid(allSatisfied);
  }, [answers, data]);

  // --- 4. Auto-scroll to keep previous and current question visible ---
  useEffect(() => {
    if (!data?.questions || !listRef.current) return;

    // Find the first question that hasn't been answered yet
    const firstUnansweredIndex = data.questions.findIndex((q) => !isAnswered(q));

    // If all are answered, scroll to the end so the submit button is visible
    if (firstUnansweredIndex === -1) {
      if (lastScrolledIndex.current < data.questions.length) {
        const lastCard = listRef.current.lastElementChild;
        if (lastCard) {
          // Aligning the last card to the top pulls the layout up, revealing controls below it
          lastCard.scrollIntoView({ behavior: "smooth", block: "start" });
          lastScrolledIndex.current = data.questions.length;
        }
      }
      return;
    }

    // ONLY scroll if the user has advanced to a new unanswered question
    if (firstUnansweredIndex > lastScrolledIndex.current) {
      // 1. Target the unanswered question directly
      const targetCard = listRef.current.children[firstUnansweredIndex];
      
      if (targetCard) {
        // 2. Use 'nearest' instead of 'start'
        targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        
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
              {t("questionnaire.pleaseAnswerAll", { ns: "tasks" })}
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
                <h4 className="question-text">
                  {q.text}
                  {q.optional && (
                    <span className="question-optional-tag">
                      {t("questionnaire.optionalLabel", { ns: "tasks" })}
                    </span>
                  )}
                </h4>
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
                    {q.options?.map((opt, i) => {
                      const checked = answers[q.id] === opt;
                      const needsFreeText = q.freeTextOptions?.includes(opt);
                      return (
                        <React.Fragment key={i}>
                          <label className="option-label">
                            <input type="radio" name={`q-${q.id}`} value={opt} checked={checked}
                              onChange={() => handleChange(q.id, opt, "single")} />
                            <span className="option-text">{opt}</span>
                          </label>
                          {renderFreeText(q, opt, checked)}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}

                {/* MULTIPLE CHOICE */}
                {q.type === "multiple" && (
                  <div className="options-group">
                    {q.options?.map((opt, i) => {
                      const checked = answers[q.id]?.includes(opt) ?? false;
                      const needsFreeText = q.freeTextOptions?.includes(opt);
                      return (
                        <React.Fragment key={i}>
                          <label className="option-label">
                            <input type="checkbox" name={`q-${q.id}`} value={opt} checked={checked}
                              onChange={() => handleChange(q.id, opt, "multiple", q.exclusiveOption)} />
                            <span className="option-text">{opt}</span>
                          </label>
                          {renderFreeText(q, opt, checked)}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}

                {/* DROPDOWN */}
                {q.type === "dropdown" && (
                  <>
                    <select className="answer-select" value={answers[q.id] || ""}
                      onChange={(e) => handleChange(q.id, e.target.value, "dropdown")}>
                      <option value="" disabled>-- {t("questionnaire.selectOption")} --</option>
                      {q.options?.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                    </select>
                    {renderFreeText(q, answers[q.id], Boolean(answers[q.id]))}
                  </>
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
                          {/*
                          <span className="emoji-scale-label">
                            {t(item.labelKey, item.label)}
                          </span>
                          */}
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