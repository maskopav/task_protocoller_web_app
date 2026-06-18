import React, { useState, useContext } from "react";
import { useTranslation, Trans } from "react-i18next";
import useScrollToTop from "../../hooks/useScrollToTop";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";
import { D15GoalMessage, D15MechanicsMessage, D15TrialCompleteMessage } from "./D15DemoMessage";

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

    // 1. Show Goal Dialog
    await confirm({
      title: t("d15colour.goalTitle", { ns: "tasks" }),
      message: <D15GoalMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });

    // 2. Mechanics — both tabs must be seen before proceeding.
    //    "add" counts as seen immediately (it's pre-selected).
    //    If the user switches to "modify" themselves → no second dialog needed.
    //    If they don't → a second dialog opens with "modify" pre-selected.
    const seenTabs = new Set(["add"]);
    
    await confirm({
      title: t("d15colour.mechanicsTitle", { ns: "tasks" }),
      message: (
        <D15MechanicsMessage
          key="mechanics-add"
          activeTab="add"
          onTabChange={(tab) => seenTabs.add(tab)}
        />
      ),
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });

    if (!seenTabs.has("modify")) {
      await confirm({
        title: t("d15colour.mechanicsTitle", { ns: "tasks" }),
        message: (
          <D15MechanicsMessage
            activeTab="modify"
            onTabChange={(tab) => seenTabs.add(tab)}
          />
        ),
        infoOnly: true,
        confirmText: t("buttons.gotIt", { ns: "common" })
      });
    }

    // Move to Trial Phase
    if (includeTrial) {
      setStep("trial");
    } else {
      setStep("test");
    }
  };

  const handleTrialComplete = async () => {
    // Trial finished successfully! Now transition directly to the real desaturated test.
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
