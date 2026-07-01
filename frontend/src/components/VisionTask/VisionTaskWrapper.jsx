import React, { useState, useContext } from "react";
import { useTranslation, Trans } from "react-i18next";
import useScrollToTop from "../../hooks/useScrollToTop";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";
import { D15AddColourMessage, D15ModifyColourMessage, D15TrialCompleteMessage } from "./D15DemoMessage";

export default function VisionTaskWrapper({ task, onNextTask }) {
  // Steps: "instructions" -> "trial" -> "test"
  const { t } = useTranslation("common");
  const [step, setStep] = useState("instructions");
  const [environmentData, setEnvironmentData] = useState(null);

  const { confirm } = useContext(ConfirmDialogContext);

  useScrollToTop(step);

  const includeTrial = task?.params?.demoTrial === "yes";

  const handleInstructionsComplete = async (data) => {
    setEnvironmentData(data); // Save setup checklist data

    // 1. Add colour (mechanics + goal)
    await confirm({
      title: t("d15colour.addTitle", { ns: "tasks" }),
      message: <D15AddColourMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });

    // 2. Modify colour (mechanics + colour-vision note)
    await confirm({
      title: t("d15colour.modifyTitle", { ns: "tasks" }),
      message: <D15ModifyColourMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });

    // Move to Trial Phase
    if (includeTrial) {
      setStep("trial");
    } else {
      setStep("test");
    }
  };

  const handleTrialComplete = async () => {
    await confirm({
      title: t("d15colour.trialCompleteTitle", { ns: "tasks" }),
      message: <D15TrialCompleteMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });
    setStep("test");
  };

  const handleTestComplete = (testResults) => {
    const finalData = {
      version: task?.params?.version || "desaturated",
      environmentSettings: environmentData,
      completionStatus:    testResults.completionStatus || "completed",
      metrics: testResults.metrics,
      events: testResults.events,
      resultIndices: testResults.result,
      timestamp: testResults.timestamp
    };

    onNextTask(finalData);
  };

  return (
    <div className="vision-task-flow">
      {step === "instructions" && (
        <PreTestInstructions onComplete={handleInstructionsComplete} />
      )}

      {step === "trial" && (
        <D15Test
          task={{ params: { version: "demo", randomize: true, showNumbers: "never" } }}
          onNextTask={handleTrialComplete}
        />
      )}

      {step === "test" && (
        <D15Test
          task={task}
          onNextTask={handleTestComplete}
        />
      )}
    </div>
  );
}