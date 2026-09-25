import React, { useState, useContext, useRef, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import useScrollToTop from "../../hooks/useScrollToTop";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";
import AudioGuidePlayer from "../AudioGuidePlayer/AudioGuidePlayer";
import { getAudioGuidePath, buildAudioGuidePath } from "../../utils/getAudioGuidePath";
import { D15AddColourMessage, D15ModifyColourMessage, D15TrialCompleteMessage, D15VersionCompleteMessage } from "./D15DemoMessage";

export default function VisionTaskWrapper({ task, onNextTask, audioGuideEnabled = true, isFirstVisionTask = true, hasMoreVisionTasks = false }) {
  // Steps: "instructions" -> "mechanics" -> "trial" -> "test"
  // "instructions" (the screen/environment setup checklist) is only asked once per
  // session, so returning vision tasks start straight at "mechanics".
  const { t, i18n } = useTranslation(["tasks","common"]);
  const [step, setStep] = useState(isFirstVisionTask ? "instructions" : "mechanics");
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
  const versionCompleteGuideRef = useRef(null);
  const trialTaskGuideRef = useRef(null);
  const testTaskGuideRef = useRef(null);

  const { confirm } = useContext(ConfirmDialogContext);

  useScrollToTop(step);

  const includeTrial = task?.params?.demoTrial === "yes";

  const handleInstructionsComplete = (data) => {
    setEnvironmentData(data); // Save setup checklist data
    // Start was just clicked. "step" doesn't change until the mechanics dialogs
    // below resolve, so PreTestInstructions — and its setup audio guide — stays
    // mounted and would otherwise keep playing underneath them.
    instructionsGuideRef.current?.stop();
    setStep("mechanics");
  };

  // Runs once whenever we enter "mechanics": shows the "how it works" dialogs
  // (add / modify a cap), reminder-worded after the first vision task this
  // session, then moves on to the trial or real test.
  useEffect(() => {
    if (step !== "mechanics") return;
    let cancelled = false;

    (async () => {
      // 1. Add colour (mechanics + goal)
      await confirm({
        title: t("d15colour.goalText", { ns: "tasks" }),
        headerRight: (
          <AudioGuidePlayer
            ref={addGuideRef}
            src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour_add") : null}
            playTrigger={`d15-add-${Date.now()}`}
            isRecordingActive={false}
          />
        ),
        message: <D15AddColourMessage isRepeat={!isFirstVisionTask} />,
        infoOnly: true,
        confirmText: t("buttons.ok", { ns: "common" })
      });
      addGuideRef.current?.stop();

      // 2. Modify colour (mechanics + colour-vision note)
      await confirm({
        title: " ",
        headerRight: (
          <AudioGuidePlayer
            ref={modifyGuideRef}
            src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour_modify") : null}
            playTrigger={`d15-modify-${Date.now()}`}
            isRecordingActive={false}
          />
        ),
        message: <D15ModifyColourMessage isRepeat={!isFirstVisionTask} />,
        infoOnly: true,
        confirmText: t("buttons.ok", { ns: "common" })
      });
      modifyGuideRef.current?.stop();

      if (cancelled) return;
      setStep(includeTrial ? "trial" : "test");
      // Both dialogs are dismissed — play the general task audio now.
      setTaskAudioTrigger((n) => n + 1);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleTrialComplete = async () => {
    await confirm({
      title: t("d15colour.trialCompleteTitle", { ns: "tasks" }),
      headerRight: (
        <AudioGuidePlayer
          ref={trialGuideRef}
          src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour_trial_completed") : null}
          playTrigger={`d15-trial-${Date.now()}`}
          isRecordingActive={false}
        />
      ),
      message: <D15TrialCompleteMessage />,
      infoOnly: true,
      confirmText: t("buttons.ok", { ns: "common" })
    });
    trialGuideRef.current?.stop();
    setStep("test");
    // Re-play the general task audio for the real test phase.
    setTaskAudioTrigger((n) => n + 1);
  };

  const handleTestComplete = async (testResults) => {
    const finalData = {
      version: task?.params?.version || "desaturated",
      background: task?.params?.background || "grey",
      environmentSettings: environmentData,
      completionStatus:    testResults.completionStatus || "completed",
      metrics: testResults.metrics,
      events: testResults.events,
      resultIndices: testResults.result,
      timestamp: testResults.timestamp
    };

    // Another version (e.g. saturated -> desaturated) still follows this one —
    // confirm this version is done before handing off to the next task.
    if (hasMoreVisionTasks) {
      await confirm({
        title: t("d15colour.versionCompleteTitle", { ns: "tasks" }),
        headerRight: (
          <AudioGuidePlayer
            ref={versionCompleteGuideRef}
            src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour_version_completed") : null}
            playTrigger={`d15-version-complete-${Date.now()}`}
            isRecordingActive={false}
          />
        ),
        message: <D15VersionCompleteMessage />,
        infoOnly: true,
        confirmText: t("buttons.ok", { ns: "common" })
      });
      versionCompleteGuideRef.current?.stop();
    }

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
              src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour_instructions") : null}
              playTrigger={`instructions-${taskAudioTrigger}`}
              isRecordingActive={false}
            />
          }
        />
      )}

      {step === "trial" && (
        <D15Test
          task={{ params: { version: "demo", randomize: true, showNumbers: "never", background: task?.params?.background } }}
          onNextTask={handleTrialComplete}
          onStopAudio={() => trialTaskGuideRef.current?.stop()}
          audioPlayer={
            <AudioGuidePlayer
              ref={trialTaskGuideRef}
              src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour") : null}
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
          onStopAudio={() => testTaskGuideRef.current?.stop()}
          audioPlayer={
            <AudioGuidePlayer
              ref={testTaskGuideRef}
              src={audioGuideEnabled ? buildAudioGuidePath(i18n.language, "d15colour") : null}
              playTrigger={`test-${taskAudioTrigger}`}
              isRecordingActive={false}
              autoPlay={!includeTrial}
            />
          }
        />
      )}
    </div>
  );
}