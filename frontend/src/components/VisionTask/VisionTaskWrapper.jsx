import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import useScrollToTop from "../../hooks/useScrollToTop";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";

export default function VisionTaskWrapper({ task, onNextTask }) {
  const [step, setStep] = useState("instructions");
  const [environmentData, setEnvironmentData] = useState(null);

  const { confirm } = useContext(ConfirmDialogContext);
  const { t } = useTranslation("tasks");

  useScrollToTop(step);

  const handleInstructionsComplete = (data) => {
    // Save the checklist answers and move to the test
    setEnvironmentData(data);
    setStep("test");
  };

  const handleTestComplete = async (testResults) => {
    // Merge the environment checklist data with the D15 results
    // so it all gets saved to your database together.
    const finalData = {
      ...testResults,
      environmentSettings: environmentData
    };

    // Trigger the dialog and halt execution until the user clicks OK
    await confirm({
      title: t("preTestChecklist.rotateBack.title"),
      message: t("preTestChecklist.rotateBack.message"),
      infoOnly: true, // Hides the "Cancel" button so they only see the confirm button
      confirmText: t("preTestChecklist.rotateBack.button")
    });
    
    onNextTask(finalData);
  };

  return (
    <div className="vision-task-flow">
      {step === "instructions" ? (
        <PreTestInstructions onComplete={handleInstructionsComplete} />
      ) : (
        <D15Test task={task} onNextTask={handleTestComplete} />
      )}
    </div>
  );
}