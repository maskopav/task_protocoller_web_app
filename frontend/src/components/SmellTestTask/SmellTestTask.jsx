// src/components/SmellTestTask/SmellTestTask.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "../TaskLayout/TaskLayout";
import Questionnaire from "../Questionnaire/Questionnaire";
import { SafeButton } from "../Shared/SafeButton";

// Two-screen flow: a static instructions screen (open the envelope, smell the
// paper inside) followed by the smell-identification question, reusing the
// same TaskLayout shell and Questionnaire engine as every other questionnaire.
export default function SmellTestTask({ task, onNextTask, onLogAnswer, isUploading }) {
  const { t } = useTranslation(["common", "tasks"]);
  const [step, setStep] = useState("instructions");

  if (step === "instructions") {
    return (
      <TaskLayout
        instructions={task.instructions}
        controls={
          <SafeButton className="btn-next" onClick={() => setStep("questionnaire")}>
            {t("buttons.next")}
          </SafeButton>
        }
      />
    );
  }

  return (
    <Questionnaire
      data={{ title: task.title, questions: task.resolvedParams.questions }}
      onNextTask={onNextTask}
      onLogAnswer={onLogAnswer}
      isUploading={isUploading}
    />
  );
}
