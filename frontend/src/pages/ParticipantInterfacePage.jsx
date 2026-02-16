// src/pages/ParticipantInterfacePage.jsx
import React, { useState, useContext, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ProtocolContext } from "../context/ProtocolContext";
import { createTask } from "../tasks";
import { resolveTasks, resolveTask } from "../utils/taskResolver";
import { VoiceRecorder } from "../components/VoiceRecorder/VoiceRecorder";
import Questionnaire from "../components/Questionnaire/Questionnaire";
import CompletionScreen from "../components/CompletionScreen";
import { ModuleCompletionOverlay } from "../components/ModuleCompletionOverlay/ModuleCompletionOverlay";
import D15Test from "../components/VisionTask/D15Test";
import { InfoPage, ConsentPage } from "../components/Onboarding/OnboardingSteps";
import { trackProgress, saveQuestionnaireAnswers } from "../api/sessions";
import { uploadRecording } from "../api/recordings";
import "./Pages.css";

export default function ParticipantInterfacePage() {
  const { i18n, t } = useTranslation(["tasks", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);

  const [taskIndex, setTaskIndex] = useState(0);
  const [langReady, setLangReady] = useState(false);

  // Add state for the completionoverlay
  const [showPraise, setShowPraise] = useState(false);
  const [completedCategory, setCompletedCategory] = useState(null);

  // Add a Ref to track the last logged task 
  // We initialize it to -1 so that index 0 is always logged the first time.
  const lastLoggedIndex = useRef(-1);

  const testingMode = location.state?.testingMode ?? false;
  const editingMode = location.state?.editingMode ?? false;
  const protocolData = location.state?.protocol || selectedProtocol;  
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

    // 1. Add Info Page if text exists
    if (selectedProtocol.info_text) {
      introSteps.push({
        type: "info",
        content: selectedProtocol.info_text,
        category: "introduction"
      });
    }

    // 2. Add Consent Page if text exists
    if (selectedProtocol.consent_text) {
      introSteps.push({
        type: "consent",
        content: selectedProtocol.consent_text,
        category: "consent"
      });
    }

    // 3. Prepare Voice Tasks
    const configured = selectedProtocol.tasks ?? [];
    // We explicitly attach protocolTaskId here so it persists through resolution
    const rawVoiceTasks = configured.map((t) => ({
      ...createTask(t.category, t),
      protocolTaskId: t.protocol_task_id 
    }));
    const resolvedVoiceTasks = resolveTasks(rawVoiceTasks);

    let finalTasks = [...introSteps, ...resolvedVoiceTasks];
    
    // 4. Check for Questionnaire
    // Assuming protocolData.questionnaire contains the JSON object from the editor
    // or it was fetched and attached to the protocol object.
    if (selectedProtocol.questionnaire) {
      finalTasks.push({
        type: "questionnaire",
        data: selectedProtocol.questionnaire,
        category: "questionnaire"
      });
    }

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
    
    try {
      // 1. Identify the current task to get metadata
      // The `data` object from VoiceRecorder comes with audioURL (blob url)
      // We need to fetch the actual Blob from that URL to send it
      let blob = null;
      if (data.audioURL) {
        const response = await fetch(data.audioURL);
        blob = await response.blob();
      }

      // Extract metadata
      const paramValue = currentTaskObj.params[0];
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

    } catch (err) {
      console.error("Failed to save result:", err);
      // Optional: Show error to user or retry
    }

    // Log the "Save" action
    logInteraction("task_saved", { recordingDuration: data.recordingTime });

    // Check Completion
    if (taskIndex + 1 >= runtimeTasks.length) {
      console.log("🏁 Session Completed");
      trackProgress(sessionId, null, true); // markCompleted = true
    }

    // Check if the next task is a different type/category or if it's the end
    if (nextTaskObj && nextTaskObj.type !== currentTaskObj.type) {
      setCompletedCategory(currentTaskObj.type);
      setShowPraise(true);
    } else {    
      // Move to next (existing logic)
      setTaskIndex((i) => i + 1);
    }
  };

  function handleBack() {
    if (location.state?.returnTo === "dashboard") {
      navigate(`/admin/projects/${protocolData.projectId}/protocols`);
      return;
    }
  
    // default → return to editor
    navigate(`/admin/projects/${protocolData.projectId}/protocols/${protocolData.id}`, {
      state: { protocol: protocolData, testingMode, editingMode },
    });
  }

  const handleSkip = () => setTaskIndex((i) => Math.min(i + 1, runtimeTasks.length));

  const renderCurrentTask = () => {
    const rawTask = runtimeTasks[taskIndex];
    if (!rawTask) return <CompletionScreen />;

    // Render Info Page
    if (rawTask.type === "info") {
      return <InfoPage content={rawTask.content} onNext={() => handleTaskComplete({ type: 'info' })} />;
    }

    // Render Consent Page
    if (rawTask.type === "consent") {
      return <ConsentPage content={rawTask.content} onNext={() => handleTaskComplete({ type: 'consent' })} />;
    }

    const currentTask = resolveTask(rawTask, t);
    console.log("▶ Current task:", currentTask);

    // Render Voice Task
    if (currentTask.type === "voice")
      return (
        <VoiceRecorder
          key={taskIndex}
          title={currentTask.title}
          instructions={currentTask.instructions}
          instructionsActive={currentTask.instructionsActive}
          audioExample={currentTask.illustration}
          mode={currentTask.recording.mode}
          duration={currentTask.recording.duration}
          onNextTask={handleTaskComplete}
          onLogEvent={logInteraction}
        />
      );
    // Render Questionnaire
    if (currentTask.type === "questionnaire") {
      // Construct the data object expected by your Questionnaire component
      const questionnaireData = {
        title: currentTask.title,
        instructions: currentTask.instructions,
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

  const currentTask = runtimeTasks[taskIndex];
  const currentType = currentTask?.type;
  const totalOfType = runtimeTasks.filter((t) => t.type === currentType).length;
  const currentOfType = runtimeTasks
    .slice(0, taskIndex + 1)
    .filter((t) => t.type === currentType).length;

  const taskLabel = t(`taskLabels.${currentType}`, { ns: "common" });

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
          {testingMode && (
            <button className="btn-back" onClick={handleBack}>
              ← {t("buttons.back", { ns: "common" })}
            </button>
          )}
          {taskIndex < runtimeTasks.length && (
            <>
              <div className="task-progress">
                {taskLabel || "Task"} {currentOfType}/{totalOfType}
              </div>
              {testingMode && (
                <button className="btn-skip" onClick={handleSkip}>
                  {t("buttons.skip", { ns: "common" })} →
                </button>
              )}
            </>
          )}
        </div>
        <div className="task-card">{renderCurrentTask()}</div>
      </div>
    </div>
  );
}
