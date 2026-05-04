import React, { useState } from "react";
import PreTestInstructions from "./PreTestInstructions";
import D15Test from "./D15Test";

export default function VisionTaskWrapper({ onNextTask }) {
  const [step, setStep] = useState("instructions");
  const [environmentData, setEnvironmentData] = useState(null);

  const handleInstructionsComplete = (data) => {
    // Save the checklist answers and move to the test
    setEnvironmentData(data);
    setStep("test");
  };

  const handleTestComplete = (testResults) => {
    // Merge the environment checklist data with the D15 results
    // so it all gets saved to your database together.
    const finalData = {
      ...testResults,
      environmentSettings: environmentData
    };
    
    onNextTask(finalData);
  };

  return (
    <div className="vision-task-flow">
      {step === "instructions" ? (
        <PreTestInstructions onComplete={handleInstructionsComplete} />
      ) : (
        <D15Test onNextTask={handleTestComplete} />
      )}
    </div>
  );
}