import React, { useState, useContext, useRef } from "react";
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
  const { t, i18n } = useTranslation(["tasks","common"]);
  const [step, setStep] = useState("instructions");
  const [environmentData, setEnvironmentData] = useState(null);
  // Bumped every time we (re-)enter the trial/test step so the general
  // task audio guide re-plays, mirroring how it behaves for other tasks.
  const [taskAudioTrigger, setTaskAudioTrigger] = useState(0);

  // Imperative handles to each header audio guide, so it can be silenced
  // synchronously the instant its advance button ("Start" / "Got it") is
  // clicked. AudioGuidePlayer only stops via its own button, isRecordingActive,
  // or an explicit ref.stop() call — it no longer stops on unrelated clicks,
  // so each guide here needs its own explicit stop.
  const instructionsGuideRef = useRef(null);
  const addGuideRef = useRef(null);
  const modifyGuideRef = useRef(null);
  const trialGuideRef = useRef(null);

  const { confirm } = useContext(ConfirmDialogContext);

  useScrollToTop(step);

  const includeTrial = task?.params?.demoTrial === "yes";

  const handleInstructionsComplete = async (data) => {
    setEnvironmentData(data); // Save setup checklist data
    // Start was just clicked. "step" doesn't change until both dialogs below
    // resolve, so PreTestInstructions — and its setup audio guide — stays
    // mounted and would otherwise keep playing underneath them.
    instructionsGuideRef.current?.stop();

    // 1. Add colour (mechanics + goal)
    await confirm({
      title: t("d15colour.goalText", { ns: "tasks" }),
      headerRight: (
        <AudioGuidePlayer
          ref={addGuideRef}
          src={buildAudioGuidePath(i18n.language, "d15colour_add")}
          playTrigger="d15-add"
          isRecordingActive={false}
        />
      ),
      message: <D15AddColourMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });
    addGuideRef.current?.stop();

    // 2. Modify colour (mechanics + colour-vision note)
    await confirm({
      title: " ",
      headerRight: (
        <AudioGuidePlayer
          ref={modifyGuideRef}
          src={buildAudioGuidePath(i18n.language, "d15colour_modify")}
          playTrigger="d15-modify"
          isRecordingActive={false}
        />
      ),
      message: <D15ModifyColourMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });
    modifyGuideRef.current?.stop();

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
          ref={trialGuideRef}
          src={buildAudioGuidePath(i18n.language, "d15colour_trial_completed")}
          playTrigger="d15-modify"
          isRecordingActive={false}
        />
      ),
      message: <D15TrialCompleteMessage />,
      infoOnly: true,
      confirmText: t("buttons.gotIt", { ns: "common" })
    });
    trialGuideRef.current?.stop();
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
              ref={instructionsGuideRef}
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