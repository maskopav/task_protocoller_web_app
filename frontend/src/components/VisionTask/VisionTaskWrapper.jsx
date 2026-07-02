import React, { useState, useContext } from "react";
import { useTranslation, Trans } from "react-i18next";
import useScrollToTop from "../../hooks/useScrollToTop";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";
import AudioGuidePlayer from "../AudioGuidePlayer/AudioGuidePlayer";
import { getAudioGuidePath, buildAudioGuidePath } from "../../utils/getAudioGuidePath";
import { D15AddColourMessage, D15ModifyColourMessage, D15TrialCompleteMessage } from "./D15DemoMessage";

export default function VisionTaskWrapper({ task, onNextTask }) {
  // Steps: "instructions" -> "trial" -> "test"
  const { t, i18n } = useTranslation("common");
  const [step, setStep] = useState("instructions");
  const [environmentData, setEnvironmentData] = useState(null);
  // Bumped every time we (re-)enter the trial/test step so the general
  // task audio guide re-plays, mirroring how it behaves for other tasks.
  const [taskAudioTrigger, setTaskAudioTrigger] = useState(0);

  const { confirm } = useContext(ConfirmDialogContext);

  useScrollToTop(step);

  const includeTrial = task?.params?.demoTrial === "yes";

  const handleInstructionsComplete = async (data) => {
    setEnvironmentData(data); // Save setup checklist data

    // 1. Add colour (mechanics + goal)
    await confirm({
      title: t("d15colour.addTitle", { ns: "tasks" }),
      headerRight: (
        <AudioGuidePlayer
          src={buildAudioGuidePath(i18n.language, "d15colour_add")}
          playTrigger="d15-add"
          isRecordingActive={false}
        />
      ),
      message: <D15AddColourMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });

    // 2. Modify colour (mechanics + colour-vision note)
    await confirm({
      title: t("d15colour.modifyTitle", { ns: "tasks" }),
      headerRight: (
        <AudioGuidePlayer
          src={buildAudioGuidePath(i18n.language, "d15colour_modify")}
          playTrigger="d15-modify"
          isRecordingActive={false}
        />
      ),
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
    // Both dialogs are dismissed — play the general task audio now.
    setTaskAudioTrigger((n) => n + 1);
  };

  const handleTrialComplete = async () => {
    await confirm({
      title: t("d15colour.trialCompleteTitle", { ns: "tasks" }),
      headerRight: (
        <AudioGuidePlayer
          src={buildAudioGuidePath(i18n.language, "d15colour_trial_completed")}
          playTrigger="d15-modify"
          isRecordingActive={false}
        />
      ),
      message: <D15TrialCompleteMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });
    setStep("test");
    // Re-play the general task audio for the real test phase.
    setTaskAudioTrigger((n) => n + 1);
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
        <PreTestInstructions 
          onComplete={handleInstructionsComplete} 
          audioPlayer={
            <AudioGuidePlayer
              src={buildAudioGuidePath(i18n.language, "d15colour_instructions")} 
              playTrigger={`instructions-${taskAudioTrigger}`}
              isRecordingActive={false}
            />
          }
        />
      )}

      {step === "trial" && (
        <D15Test
          task={{ params: { version: "demo", randomize: true, showNumbers: "never" } }}
          onNextTask={handleTrialComplete}
          audioPlayer={
            <AudioGuidePlayer
              src={buildAudioGuidePath(i18n.language, "d15colour_trial")} 
              playTrigger={`trial-${taskAudioTrigger}`}
              isRecordingActive={false}
            />
          }
        />
      )}

      {step === "test" && (
        <D15Test
          task={task}
          onNextTask={handleTestComplete}
          audioPlayer={
            <AudioGuidePlayer
              src={getAudioGuidePath(task?.name || "d15colour", task?.params, 1, i18n.language)}
              playTrigger={`test-${taskAudioTrigger}`}
              isRecordingActive={false}
            />
          }
        />
      )}
    </div>
  );
}