// src/components/SmellTestTask/SmellTestTask.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "../TaskLayout/TaskLayout";
import { SafeButton } from "../Shared/SafeButton";
import FormattedText from "../FormattedText/FormattedText";
import { NO_SCENT_KEY } from "../../config/smellScents";
import ScentPicker from "./ScentPicker";
import RatingSheet from "./RatingSheet";
import ScentCard from "./ScentCard";
import { SMELL_RATINGS } from "./smellRatings";
import "./SmellTestTask.css";

// Two intro screens (get the card ready; how-to with a looping video), then
// one screen per scent question. Picking a scent opens a sheet that steps through
// SMELL_RATINGS; the answer is saved only once every rating is picked, so
// closing the sheet midway changes nothing. Questions are authored in the same
// question builder as questionnaires (options + optionImages). Each question is
// one scent on the physical card; ScentCard below the pictures shows which one.
//
// Submitted answers: { [questionId]: { scent, label, intensity, pleasantness } }
// — `scent` is the language-independent key, `label` the text shown;
// "No scent" carries no ratings.

// Silent demo clip: rub a box, smell it, tap the answer. Shared by all languages.
const HOWTO_VIDEO = `${import.meta.env.BASE_URL}assets/smell/smell-howto.mp4`;

export default function SmellTestTask({ task, onNextTask, onLogAnswer, isUploading }) {
  const { t } = useTranslation(["common", "tasks"]);
  const questions = task.resolvedParams?.questions || [];
  const [index, setIndex] = useState(-2); // -2 = get ready, -1 = how-to
  const [videoFailed, setVideoFailed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState(null); // answer being rated + current sheet step

  const goNext = () => {
    if (index < questions.length - 1) return setIndex(index + 1);
    return onNextTask({ taskType: "smell", timestamp: new Date().toISOString(), answers });
  };

  if (index < 0) {
    const isHowTo = index === -1;
    return (
      <TaskLayout
        mainClassName="smell-main"
        instructions={<FormattedText text={isHowTo ? t("tasks:smell.howTo") : task.instructions} />}
        instructionsKey={index}
        controls={<SafeButton className="btn-next" onClick={goNext}>{t("buttons.next")}</SafeButton>}
      >
        {isHowTo
          ? !videoFailed && (
            <video
              className="smell-howto-video"
              src={HOWTO_VIDEO}
              autoPlay muted loop playsInline
              onError={() => setVideoFailed(true)}
            />
          )
          : <ScentCard count={questions.length} preview />}
      </TaskLayout>
    );
  }

  const question = questions[index];
  const answer = answers[question.id];

  const save = (value) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    if (onLogAnswer) onLogAnswer(question.id, value);
    setDraft(null);
  };

  const handlePick = (label) => {
    const scent = question.optionImages?.[label] ?? null;
    if (scent === NO_SCENT_KEY) return save({ scent, label });
    // Re-opening the picked scent starts from its saved ratings
    return setDraft({ ...(answer?.label === label ? answer : { scent, label }), step: 0 });
  };

  const handleRate = (value) => {
    const { step, ...rated } = { ...draft, [SMELL_RATINGS[draft.step].id]: value };
    if (step < SMELL_RATINGS.length - 1) setDraft({ ...rated, step: step + 1 });
    else save(rated);
  };

  const badge = answer && answer.scent !== NO_SCENT_KEY && (
    <span className="scent-option-badge">
      {SMELL_RATINGS.map((r) => {
        const level = r.levels.find((l) => l.value === answer[r.id]);
        return level && <React.Fragment key={r.id}>{r.renderIcon(level)}</React.Fragment>;
      })}
    </span>
  );

  return (
    <TaskLayout
      mainClassName="smell-main"
      controls={
        <SafeButton
          className="btn-next"
          onClick={goNext}
          disabled={(!answer && !question.optional) || isUploading}
        >
          {t("buttons.next")}
        </SafeButton>
      }
    >
      <h2 className="smell-question">{question.text}</h2>
      <ScentPicker question={question} selected={answer?.label} badge={badge} onPick={handlePick} />
      <ScentCard count={questions.length} current={index} />

      {draft && (
        <RatingSheet
          scentLabel={draft.label}
          rating={SMELL_RATINGS[draft.step]}
          step={draft.step}
          stepCount={SMELL_RATINGS.length}
          value={draft[SMELL_RATINGS[draft.step].id]}
          onPick={handleRate}
          onBack={draft.step > 0 ? () => setDraft({ ...draft, step: draft.step - 1 }) : null}
          onClose={() => setDraft(null)}
        />
      )}
    </TaskLayout>
  );
}
