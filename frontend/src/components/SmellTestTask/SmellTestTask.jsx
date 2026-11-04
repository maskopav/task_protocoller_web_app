// src/components/SmellTestTask/SmellTestTask.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "../TaskLayout/TaskLayout";
import { SafeButton } from "../Shared/SafeButton";
import FormattedText from "../FormattedText/FormattedText";
import { NO_SCENT_KEY, localizeSmellQuestion } from "../../config/smellScents";
import ScentPicker from "./ScentPicker";
import RatingSheet from "./RatingSheet";
import ScentCard from "./ScentCard";
import SmellHowTo from "./SmellHowTo";
import { SMELL_RATINGS } from "./smellRatings";
import "./SmellTestTask.css";

// Two intro screens (get the card ready; how-to with a looping video whose
// caption follows the clip step by step — see SmellHowTo), then
// one screen per scent question. Picking a scent opens a sheet that steps through
// SMELL_RATINGS; the answer is saved only once every rating is picked, so
// closing the sheet midway changes nothing. Questions are authored in the same
// question builder as questionnaires (options + optionImages). Each question is
// one scent on the physical card; ScentCard above the pictures shows which one.
//
// Submitted answers: { [questionId]: { scent, label, intensity, pleasantness } }
// — `scent` is the language-independent key, `label` the text shown;
// "No scent" carries no ratings.
//
// Every saved scent is also passed to onSaveProgress, so a drop-out still
// leaves a (completed: false) result. A respondent who returns after a
// drop-out starts the whole test again from the intro; howToSeen (they got
// past the how-to before) only unlocks its Next straight away.
//
// onGuideClip reports the audio guide clip for what is on screen (the page's
// guide player plays it): "smell" on the get-ready screen, "smell_howto_<n>"
// for the how-to step the video is showing, null on the scent screens.

export default function SmellTestTask({
  task, howToSeen, onNextTask, onLogAnswer, onLogEvent, onSaveProgress, onGuideClip, isUploading,
}) {
  const { t, i18n } = useTranslation(["common", "tasks"]);
  // Labels and default question text in the participant's language — see
  // localizeSmellQuestion
  const rawQuestions = task.resolvedParams?.questions;
  const questions = useMemo(() => {
    const tTasks = (key, opts) => t(`tasks:${key}`, opts);
    const defaultTexts = new Set(Object.keys(i18n.options?.resources || {})
      .map((lng) => t("tasks:smell.questionText", { lng })));
    return (rawQuestions || []).map((q) => localizeSmellQuestion(q, tTasks, defaultTexts));
  }, [rawQuestions, t, i18n]);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(-2); // -2 = get ready, -1 = how-to, then the scents
  const [draft, setDraft] = useState(null); // answer being rated + current sheet step
  // Next waits for the clip, unless it was already seen before a drop-out
  const [howToWatched, setHowToWatched] = useState(!!howToSeen);
  const [howToStep, setHowToStep] = useState(0); // step the how-to video is on

  const guideClip = index === -2 ? "smell" : index === -1 ? `smell_howto_${howToStep + 1}` : null;
  useEffect(() => {
    onGuideClip?.(guideClip);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per clip change
  }, [guideClip]);

  // Shows where a drop-out happened even if the open scent was never answered
  const questionId = questions[index]?.id;
  useEffect(() => {
    if (questionId && onLogEvent) onLogEvent("smell_scent_opened", { questionId, scentNumber: index + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per scent, not per render
  }, [questionId]);

  const goNext = () => {
    if (index < questions.length - 1) return setIndex(index + 1);
    return onNextTask({ taskType: "smell", timestamp: new Date().toISOString(), completed: true, answers });
  };

  if (index < 0) {
    const isHowTo = index === -1;
    const howToSteps = t("tasks:smell.howToSteps", { returnObjects: true });
    return (
      <TaskLayout
        mainClassName="smell-main"
        title={isHowTo ? t("tasks:smell.howToTitle") : null}
        renderTitle={isHowTo}
        instructions={isHowTo ? null : <FormattedText text={task.instructions} />}
        controls={
          <SafeButton className="btn-next" onClick={goNext} disabled={isHowTo && !howToWatched}>
            {t("buttons.next")}
          </SafeButton>
        }
      >
        {isHowTo
          ? (
            <SmellHowTo
              steps={Array.isArray(howToSteps) ? howToSteps : []}
              onWatched={() => setHowToWatched(true)}
              onStepChange={setHowToStep}
            />
          )
          : <ScentCard count={questions.length} preview />}
      </TaskLayout>
    );
  }

  const question = questions[index];
  const answer = answers[question.id];
  // Matched by scent key, so a saved answer is found whatever language its
  // label was saved in
  const isAnswer = (label) => !!answer && (answer.scent
    ? answer.scent === question.optionImages?.[label]
    : answer.label === label);
  const selectedLabel = question.options?.find(isAnswer);

  const save = (value) => {
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    if (onLogAnswer) onLogAnswer(question.id, value);
    if (onSaveProgress) onSaveProgress(next);
    setDraft(null);
  };

  const handlePick = (label) => {
    const scent = question.optionImages?.[label] ?? null;
    if (scent === NO_SCENT_KEY) return save({ scent, label });
    // Re-opening the picked scent starts from its saved ratings
    return setDraft({ ...(isAnswer(label) ? { ...answer, label } : { scent, label }), step: 0 });
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
      <ScentCard count={questions.length} current={index} />
      <ScentPicker question={question} selected={selectedLabel} badge={badge} onPick={handlePick} />

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
