// src/pages/ParticipantInterfacePage.jsx
import React, { useState, useContext, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ProtocolContext } from "../context/ProtocolContext";
import { createTask } from "../tasks";
import { resolveTasks, resolveTask } from "../utils/taskResolver";
import { Recorder } from "../components/Recorder/Recorder";
import Questionnaire from "../components/Questionnaire/Questionnaire";
import CompletionScreen from "../components/CompletionScreen/CompletionScreen";
import { ModuleCompletionOverlay } from "../components/ModuleCompletionOverlay/ModuleCompletionOverlay";
import D15Test from "../components/VisionTask/D15Test";
import { InfoPage, ConsentPage } from "../components/IntroComponents/IntroComponents";
import MicCheck from "../components/Recorder/MicCheck";
import { trackProgress, saveQuestionnaireAnswers } from "../api/sessions";
import { uploadRecording } from "../api/recordings";
import { getTaskProgressDisplay, checkCompletionOverlay } from "../utils/progressTracker";
import "./Pages.css";

export default function ParticipantInterfacePage() {
  const { i18n, t } = useTranslation(["tasks", "common", "admin"]);
  const navigate = useNavigate();
  const location = useLocation();
  const originalTasks = location.state?.originalTasks;
  const previewRandomized = location.state?.previewRandomized;
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);

  const [taskIndex, setTaskIndex] = useState(0);
  const [langReady, setLangReady] = useState(false);
  const [isRecordingActive, setIsRecordingActive] = useState(false);

  // Add state for the completionoverlay
  const [showPraise, setShowPraise] = useState(false);
  const [completedCategory, setCompletedCategory] = useState(null);

  // Add a Ref to track the last logged task 
  // We initialize it to -1 so that index 0 is always logged the first time.
  const lastLoggedIndex = useRef(-1);

  const testingMode = location.state?.testingMode ?? false;
  const editingMode = location.state?.editingMode ?? false;
  const protocolData = location.state?.protocol || selectedProtocol;  
  const randomStrategy = protocolData?.randomization?.strategy || 'none';
  const moduleSettings = protocolData?.randomization?.moduleSettings || {};
  // For saving recordings in the future.....
  const participant = location.state?.participant;
  const accessToken = location.state?.token;
  const sessionId = location.state?.sessionId;

  // Restore protocol in context
  useEffect(() => {
    if (protocolData && !selectedProtocol) {
      setSelectedProtocol(protocolData);
    }
  }, [protocolData, selectedProtocol, setSelectedProtocol]);

  // Handle language switching
  useEffect(() => {
    if (!protocolData) return;
    const protocolLang = protocolData.language || "en";
    const prevLang = i18n.language;

    setLangReady(false);
    if (protocolLang !== prevLang) {
      i18n.changeLanguage(protocolLang).then(() => setLangReady(true));
    } else {
      setLangReady(true);
    }

    return () => {
      i18n.changeLanguage(prevLang);
    };
  }, [protocolData, i18n]);

  // Generate runtime tasks + inject Questionnaire if present from the selected protocol
  const runtimeTasks = useMemo(() => {
    if (!selectedProtocol) return [];

    const introSteps = [];

    console.log(selectedProtocol)

    // Helper to find content by type in the global_contents array
    const findGlobalContent = (type) => {
      return selectedProtocol.global_contents?.find(c => c.type === type)?.html;
    };

    // 1. Add Info Page (check root field OR new array)
    const infoHtml = selectedProtocol.info_text || findGlobalContent('info');
    if (infoHtml) {
      introSteps.push({
        type: "info",
        content: infoHtml,
        category: "info"
      });
    }

    // 2. Add Consent Page (check root field OR new array)
    const consentHtml = selectedProtocol.consent_text || findGlobalContent('consent');
    if (consentHtml) {
      introSteps.push({
        type: "consent",
        content: consentHtml,
        category: "consent"
      });
    }

    // 3. Prepare Tasks
    const configured = selectedProtocol.tasks ?? [];

    // We explicitly attach protocolTaskId here so it persists through resolution
    const rawVoiceTasks = configured.map((t) => ({
      ...createTask(t.category, t),
      protocolTaskId: t.protocol_task_id 
    }));
    const resolvedVoiceTasks = resolveTasks(rawVoiceTasks);

    // Check if there are any voice/camera tasks that require the microphone
    const requiresMic = resolvedVoiceTasks.some(t => t.type === 'voice' || t.type === 'camera');

    let finalTasks = [...introSteps];
    
    // Inject the calibration/setup step if a mic is needed
    if (requiresMic) {
      finalTasks.push({ 
        type: "mic_check", 
        category: "setup", 
        title: "Microphone Setup" 
      });
    }

    finalTasks = [...finalTasks, ...resolvedVoiceTasks];

    return finalTasks;
  }, [selectedProtocol, i18n.language]);


  //  Central Logger Helper 
  const logInteraction = (action, extra = {}) => {
    if (!sessionId) return;
    
    const currentTask = runtimeTasks[taskIndex];
    const eventData = {
      protocolTaskId: currentTask?.protocolTaskId,
      taskIndex: taskIndex + 1, // Human readable 1-based
      action, // 'task_opened', 'button_start', etc.
      ...extra
    };
    
    trackProgress(sessionId, eventData);
  };

  // Log "Task Open" on index change
  useEffect(() => {
    if (runtimeTasks[taskIndex] && lastLoggedIndex.current !== taskIndex) {
      logInteraction("task_opened");
      lastLoggedIndex.current = taskIndex;
    }
  }, [taskIndex, runtimeTasks]);


  // --- early return only after all hooks are declared
  if (!protocolData) return <p>No protocol selected.</p>;
  if (!langReady) return <p>Loading translations...</p>;

  // --- Handlers
  async function handleTaskComplete(data) {
    console.log("✅ Task Completed, saving...", data);
    const currentTaskObj = runtimeTasks[taskIndex]; // The task definition
    console.log(currentTaskObj);
    const nextTaskObj = runtimeTasks[taskIndex + 1];

    // EXIT EARLY if it's just an onboarding step (no data to save to the DB yet)
    if (currentTaskObj.type === "info" || currentTaskObj.type === "consent") {
      logInteraction(`${currentTaskObj.type}_completed`);
      setTaskIndex((i) => i + 1)
      return;
    }

    if (testingMode || editingMode || !sessionId) {
      console.log("🛠️ Testing mode: skipping database save.");
      proceedToNext(); 
      return;
    }
      
    try {
      // 1. Identify the current task to get metadata
      // The `data` object from Recorder comes with audioURL (blob url)
      // We need to fetch the actual Blob from that URL to send it
      let blob = null;
      if (data.audioURL) {
        const response = await fetch(data.audioURL);
        blob = await response.blob();
      }

      // Extract metadata
      const paramValue = currentTaskObj.params?.[0] || "";
      const repeatIndex = currentTaskObj._repeatIndex || 1;

      // 2. Upload
      if (blob && accessToken) {
        await uploadRecording(blob, {
          token: accessToken,
          sessionId: sessionId,
          protocolTaskId: currentTaskObj.protocolTaskId,
          taskCategory: currentTaskObj.category,
          taskOrder: taskIndex + 1, // Assumes taskIndex matches DB order
          duration: data.recordingTime || 0,
          taskParam: paramValue,
          repeatIndex: repeatIndex,
          timeStamp: data.timestamp
        });
        console.log("Upload successful");
      } else if (currentTaskObj.type === "questionnaire") {
        await saveQuestionnaireAnswers({
          sessionId: sessionId,
          protocolTaskId: currentTaskObj.protocolTaskId,
          answers: data.answers
        });
        console.log("Questionnaire answers saved successfully");
      }

      // Log the "Save" action
      logInteraction("task_saved", { recordingDuration: data.recordingTime });
      proceedToNext();

    } catch (err) {
      console.error("Failed to save result:", err);
      // Optional: Show error to user or retry
    }


    // Helper function to handle progression and praise screen
    function proceedToNext() {
      if (taskIndex + 1 >= runtimeTasks.length) {
        trackProgress(sessionId, null, true);
        setTaskIndex((i) => i + 1); // Move to completion screen
        return;
      }
    
      const { showOverlay, category } = checkCompletionOverlay(runtimeTasks, taskIndex, randomStrategy);
    
      if (showOverlay) {
        setCompletedCategory(category);
        setShowPraise(true);
      } else {
        setTaskIndex((i) => i + 1);
      }
    }
  }

  function handleBack() {
    if (location.state?.returnTo === "dashboard") {
      navigate(`/admin/projects/${protocolData.projectId}/protocols`);
      return;
    }
  
    // default → return to editor
    navigate(`/admin/projects/${protocolData.projectId}/protocols/${protocolData.id}`, {
      state: { 
        protocol: protocolData, 
        originalTasks, 
        previewRandomized,
        testingMode, 
        editingMode
      },
    });
  }

  const handleSkip = () => setTaskIndex((i) => Math.min(i + 1, runtimeTasks.length));

  const rawTask = runtimeTasks[taskIndex];
  
  // Try to resolve the current task if it exists and isn't a special screen (info/consent/mic_check)
  let currentTask = null;
  let isReadingTask = false;

  if (rawTask && !['info', 'consent', 'mic_check'].includes(rawTask.type)) {
     currentTask = resolveTask(rawTask, t);
     isReadingTask = currentTask?.category === 'reading'; 
  }

  const renderCurrentTask = () => {
    const rawTask = runtimeTasks[taskIndex];
    if (!rawTask) {
       return (
        <CompletionScreen 
          testingMode={testingMode}
          onBack={handleBack}
        />
      );
    }
    
    // Render Info Page
    if (rawTask.type === "info") {
      return <InfoPage content={rawTask.content} onNext={() => handleTaskComplete({ type: 'info' })} />;
    }

    // Render Consent Page
    if (rawTask.type === "consent") {
      return <ConsentPage content={rawTask.content} onNext={() => handleTaskComplete({ type: 'consent' })} />;
    }

    // Render the Mic Check component
    if (rawTask.type === "mic_check") {
      return <MicCheck onNext={() => handleTaskComplete({ type: 'mic_check' })} sessionId={sessionId} token={accessToken} />;
    }

    const currentTask = resolveTask(rawTask, t);
    console.log("▶ Current task:", currentTask);

    // Render Voice Task
    if (currentTask.type === "voice" || currentTask.type === 'camera')
      return (
        <Recorder
          key={taskIndex}
          title={currentTask.title}
          instructions={currentTask.instructions}
          instructionsActive={currentTask.instructionsActive}
          completedInstructions={t("completion.taskCompletedInstructions", { ns: "common" })}
          audioExample={currentTask.illustration}
          mode={currentTask.recording.mode}
          duration={currentTask.recording.duration}
          taskParams={currentTask.resolvedParams}
          recordVideo={currentTask.resolvedParams?.recordVideo || false}
          onNextTask={handleTaskComplete}
          onLogEvent={logInteraction}
          useVAD={currentTask.useVAD}
          hideTitle={isReadingTask}
          onRecordingStateChange={setIsRecordingActive}
          showMicIcon={isReadingTask ? true : undefined}
        />
      );
    // Render Questionnaire
    if (currentTask.type === "questionnaire") {
      // Construct the data object expected by your Questionnaire component
      const questionnaireData = {
        title: currentTask.title,
        instructions: currentTask.description || currentTask.instructions,
        questions: currentTask.resolvedParams.questions
      };

      return (
        <Questionnaire
          key={taskIndex}
          data={questionnaireData}
          onNextTask={handleTaskComplete}
          // Pass logging helper to track answer clicks
          onLogAnswer={(qId, value) => logInteraction("answer_clicked", { questionId: qId, value })}
        />
      );
    }

    // Render vision task
    if (currentTask.type === "vision") {
      return (
        <D15Test 
          key={taskIndex}
          onNextTask={handleTaskComplete}
        />
      );
    }
    return <p>Unknown task type: {currentTask.type}</p>;
  };

  const progressDisplay = getTaskProgressDisplay(runtimeTasks, taskIndex, randomStrategy, t);


  return (
    <div className="app-container">
      {showPraise && (
        <ModuleCompletionOverlay 
          category={completedCategory} 
          onComplete={() => {
            setShowPraise(false);
            setTaskIndex((i) => i + 1); // Move to next module
          }} 
        />
      )}
      <div className="task-wrapper">
        <div className="top-controls-participant">
          <div className="top-left-controls">
            {testingMode && (
              <button className="btn-back" onClick={handleBack}>
                ← {t("buttons.back", { ns: "common" })}
              </button>
            )}
          </div>

          <div className="top-center-controls">
            {testingMode && randomStrategy !== 'none' && (
              <div className="testing-mode-badge">
                🎲 {t("protocolEditor.testingBadge.randomization", { ns: "admin" })}: {t(`protocolEditor.testingBadge.strategies.${randomStrategy}`, { ns: "admin" })}
                {randomStrategy === 'module' && (
                  <span className="badge-subtext">
                    ({t("protocolEditor.testingBadge.blocks", { ns: "admin" })}: {moduleSettings.shuffleBlocks ? t("protocolEditor.testingBadge.on", { ns: "admin" }) : t("protocolEditor.testingBadge.off", { ns: "admin" })} | {t("protocolEditor.testingBadge.within", { ns: "admin" })}: {moduleSettings.shuffleWithin ? t("protocolEditor.testingBadge.on", { ns: "admin" }) : t("protocolEditor.testingBadge.off", { ns: "admin" })})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Skip Button */}
          <div className="top-right-controls">
            {taskIndex < runtimeTasks.length && testingMode && (
              <button className="btn-skip" onClick={handleSkip}>
                {t("buttons.skip", { ns: "common" })} →
              </button>
            )}
          </div>
        </div>

        <div className="task-card">
          {taskIndex < runtimeTasks.length && progressDisplay && !(isReadingTask && isRecordingActive) && (
            <div className="task-progress">
              {progressDisplay.label} {progressDisplay.current} / {progressDisplay.total}
            </div>
          )}
          
          {/* Task Content */}
          {renderCurrentTask()}
        </div>
      </div>
    </div>
  );
}
