import React, { useState, useContext } from "react";
import useScrollToTop from "../../hooks/useScrollToTop";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";
import { D15GoalMessage, D15MechanicsMessage } from "./D15DemoMessage";

export default function VisionTaskWrapper({ task, onNextTask }) {
  // Steps: "instructions" -> "trial" -> "test"
  const [step, setStep] = useState("instructions");
  const [environmentData, setEnvironmentData] = useState(null);

  const { confirm } = useContext(ConfirmDialogContext);

  useScrollToTop(step);

  const includeTrial = task?.params?.demoTrial === "yes";

  const handleInstructionsComplete = async (data) => {
    setEnvironmentData(data); // Save setup checklist data

    // 1. Show Goal Dialog
    await confirm({
      title: "Task Goal",
      message: <D15GoalMessage />,
      infoOnly: true
    });

    // 2. Show Mechanics Dialog
    await confirm({
      title: "How to Play",
      message: <D15MechanicsMessage />,
      infoOnly: true
    });

    // Move to Trial Phase
    if (includeTrial) {
      setStep("trial");
    } else {
      setStep("test");
    }
  };

  const handleTrialComplete = () => {
    // Trial finished successfully! Now transition directly to the real desaturated test.
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