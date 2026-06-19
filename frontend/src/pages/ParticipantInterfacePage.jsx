// src/pages/ParticipantInterfacePage.jsx
import React, { useState, useContext, useMemo, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { usePreventNavigation } from "../hooks/usePreventNavigation";
import { ProtocolContext } from "../context/ProtocolContext";
import { createTask } from "../tasks";
import { resolveTasks, resolveTask } from "../utils/taskResolver";
import { Recorder } from "../components/Recorder/Recorder";
import Questionnaire from "../components/Questionnaire/Questionnaire";
import CompletionScreen from "../components/CompletionScreen/CompletionScreen";
import { ModuleCompletionOverlay } from "../components/ModuleCompletionOverlay/ModuleCompletionOverlay";
import VisionTaskWrapper from "../components/VisionTask/VisionTaskWrapper";
import { InfoPage, ConsentPage } from "../components/IntroComponents/IntroComponents";
import MicCheck from "../components/Recorder/MicCheck";
import SDMTTask from "../components/SDMTTask/SDMTTask";
import { trackProgress } from "../api/sessions";
import { uploadRecording, uploadMicCheck } from "../api/recordings";
import { saveTaskResult } from "../api/taskResults";
import { getTaskProgressDisplay, checkCompletionOverlay } from "../utils/progressTracker";
import { useConfirm } from "../components/ConfirmDialog/ConfirmDialogContext";
import { useWakeLock } from "../hooks/useWakeLock";
import "./Pages.css";
import { logToServer } from "../utils/frontendLogger";
import {
  saveRecordingLocally,
  getPendingRecordingsForSession,   // (or getPendingRecordings — same export)
  markRecordingStatus,
  deleteLocalRecording,
} from '../utils/offlineStorage';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const activeUploads = new Set();


export default function ParticipantInterfacePage() {
  const { i18n, t } = useTranslation(["tasks", "common", "admin"]);
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const originalTasks = location.state?.originalTasks;
  const previewRandomized = location.state?.previewRandomized;
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);
  const startingTaskIndex = parseInt(location.state?.startingTaskIndex || 0, 10);
  const isResumed = location.state?.isResumed || false;

  const [taskIndex, setTaskIndex] = useState(startingTaskIndex);
  const [langReady, setLangReady] = useState(false);
  const [isRecordingActive, setIsRecordingActive] = useState(false);

  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    if (startingTaskIndex > 0) {
      setTaskIndex(startingTaskIndex);
    }
  }, [startingTaskIndex]);

  // Show a brief "Welcome back" banner if resumed
  const [showResumedToast, setShowResumedToast] = useState(isResumed);

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
  // Extract language info to know if we should show the button
  const availableLanguages = protocolData?.available_languages || [];
  const hasMultipleLanguages = availableLanguages.length > 1;
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

  // Show welcome-back dialog once on mount if this is a resumed session plus log if language was just switched
  useEffect(() => {
    if (isResumed) {
      logInteraction("is_resumed");
      confirm({
        infoOnly: true,
        title: <Trans i18nKey="resumedSession.title"></Trans>,
        message: <Trans i18nKey="resumedSession.message"></Trans>,
        confirmText: <Trans i18nKey="resumedSession.continue"></Trans>,
      });
    }

    if (sessionStorage.getItem("justSwitchedLanguage") === "true") {
      logInteraction("language_switched", { lang: protocolData?.language || "unknown" });
      sessionStorage.removeItem("justSwitchedLanguage"); 
    }
  }, []); 

  // Generate runtime tasks + inject Questionnaire if present from the selected protocol
  const runtimeTasks = useMemo(() => {
    if (!selectedProtocol) return [];

    const introSteps = [];

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
        category: "info",
        isSystemTask: true
      });
    }

    // 2. Add Consent Page (check root field OR new array)
    const consentHtml = selectedProtocol.consent_text || findGlobalContent('consent');
    if (consentHtml) {
      introSteps.push({
        type: "consent",
        content: consentHtml,
        category: "consent",
        isSystemTask: true
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
        category: "audio_setup", 
        title: "Microphone Setup",
        isSystemTask: true
      });
    }

    finalTasks = [...finalTasks, ...resolvedVoiceTasks];

    return finalTasks;
  }, [selectedProtocol, i18n.language]);

  const isSessionActive = taskIndex < runtimeTasks.length && !testingMode && !editingMode;

  // Protect the page from accidental reloads/closes
  usePreventNavigation(isSessionActive);

  // Manage screen wake lock for the whole session
  useEffect(() => {
    if (isSessionActive) {
      // Request the lock when a live session is ongoing
      requestWakeLock();
    } else {
      // Release it if the session ends (e.g., they reach the CompletionScreen)
      releaseWakeLock();
    }

    // Cleanup function: Release the lock if the component unmounts unexpectedly
    return () => {
      releaseWakeLock();
    };
  }, [isSessionActive, requestWakeLock, releaseWakeLock]);

  // When the network comes back mid-session, retry every recording that is still
  // sitting in IDB as 'pending'.
  useEffect(() => {
    if (networkStatus === 'offline' || !sessionId) return;

    async function flushOnReconnect() {
      try {
        const pending = await getPendingRecordingsForSession(sessionId);
        if (pending.length === 0) return;

        logToServer(`[Reconnect Flush] Retrying ${pending.length} pending recording(s)`);

        for (const record of pending) {
          if (!navigator.onLine) break;
          
          if (activeUploads.has(record.id)) continue;
          activeUploads.add(record.id);

          try {
            // 1. ROUTE THE API CALL (using record.metadata, NOT meta)
            if (record.metadata.isSystemTask) {
              // System tasks skip data upload
            } else if (record.metadata.isMicCheck && record.metadata.isBlob) {
              await uploadMicCheck(record.blob, record.metadata);
            } else if (record.metadata.isBlob) {
              await uploadRecording(record.blob, record.metadata);
            } else {
              await saveTaskResult({
                sessionId: record.metadata.sessionId,
                protocolTaskId: record.metadata.protocolTaskId,
                repeat_index: record.metadata.repeatIndex || 1,
                payload: record.metadata.payload                               
              });
            }

            // 2. Safely remove from IndexedDB
            await markRecordingStatus(record.id, 'uploaded');
            await deleteLocalRecording(record.id);
            
            // 3. TRACK PROGRESS CAREFULLY (using record.metadata, NOT meta)
            await trackProgress(sessionId, {
              action: meta.progressAction,
              protocolTaskId: meta.protocolTaskId,
              ...(meta.isAttemptOnly  && { snrScore: meta.snrScore }),
              ...(!meta.isAttemptOnly && !meta.isMicCheck && { taskIndex: meta.taskOrder }),
            });
            
            logToServer(`[Reconnect Flush] task ${record.metadata.taskIndex} uploaded ✓`);
          } catch (err) {
            logToServer(`[Reconnect Flush] task ${record.metadata?.taskIndex} still failing: ${err.message}`);
          } finally {
            activeUploads.delete(record.id);
          }
        }
      } catch (err) {
        logToServer(`[Reconnect Flush] Error reading IDB: ${err.message}`);
      }
    }

    flushOnReconnect();
  }, [networkStatus, sessionId]);


  //  Central Logger Helper 
  const logInteraction = (action, extra = {}) => {
    if (!sessionId) return;
    
    const currentTask = runtimeTasks[taskIndex];
    
    // Simplified, flat event data structure
    const eventData = {
      action: action,
      taskIndex: taskIndex + 1, // Human readable 1-based UI position
      taskName: currentTask?.type || "unknown", // "info", "consent", "mic_check", "syllableRepeating", etc.
      
      // Send the ID for real tasks, but send strict 'null' for system pages
      protocolTaskId: currentTask?.isSystemTask ? null : (currentTask?.protocolTaskId || null),
      
      ...extra // Allows attaching snr_score, duration, etc.
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

  // --- Handle missing state (Refresh fallback) ---
  // --- Stale State / Refresh Detection ---
  // We use useState with an initializer function so this check runs EXACTLY ONCE on mount.
  // This prevents infinite loops when the component re-renders during normal use.
  const [isStaleRefresh] = useState(() => {
    const currentLoad = location.state?.loadTimestamp;
    const lastLoad = sessionStorage.getItem("lastLoadTimestamp");
    return currentLoad && currentLoad.toString() === lastLoad;
  });

  const needsRedirect = !protocolData || isStaleRefresh;

  useEffect(() => {
    if (needsRedirect) {
      const savedToken = localStorage.getItem("neuroSHARE_tokenId");
      
      console.log(`[DEBUG - Page] State lost or stale refresh detected! Routing to Loader...`);
      logToServer(`[DEBUG - Page] State lost or stale refresh detected! Routing to Loader...`);

      if (savedToken) {
        // Force the app back to the Loader to fetch the single source of truth
        navigate("/participant/" + savedToken, { replace: true, state: {} });
      } else {
        navigate('/not-found', { replace: true });
      }
    } else if (location.state?.loadTimestamp) {
      // Fresh load from the Loader — lock in the stamp!
      sessionStorage.setItem("lastLoadTimestamp", location.state.loadTimestamp.toString());
    }
  }, [needsRedirect, location.state?.loadTimestamp, navigate]);

  // --- Early returns ---
  // Return a clean loading container so the user doesn't see broken UI while redirecting
  if (needsRedirect || !protocolData) {
    return <div className="app-container"><p>{t("loading", "Loading…")}</p></div>;
  }
  if (!langReady) {
    return <div className="app-container"><p>{t("loading", "Loading translations…")}</p></div>;
  }

async function handleTaskComplete(data, isAttempt = false) {
    const currentTaskObj = runtimeTasks[taskIndex];
    const isSystemTask = ['info', 'consent'].includes(currentTaskObj.type);
    const isMicCheck = currentTaskObj.type === 'mic_check';
   
    if (testingMode || editingMode || !sessionId) {
      if (!isAttempt) proceedToNext();
      return;
    }
   
    try {
      let blob = null;
      if (data?.audioBlob) {
        blob = data.audioBlob;
      } else if (data?.audioURL) {
        const response = await fetch(data.audioURL);
        blob = await response.blob();
      }
   
      const paramValue  = currentTaskObj.params?.[0] || '';
      const repeatIndex = currentTaskObj._repeatIndex || 1;
      
      const recordingId = `${sessionId}_task${taskIndex}${isAttempt ? `_attempt_${Date.now()}` : ''}`;
   
      const uploadMeta = {
        token: accessToken,
        sessionId,
        taskIndex,
        protocolTaskId: currentTaskObj.protocolTaskId ?? null,
        taskCategory: currentTaskObj.category,
        taskOrder: taskIndex + 1,
        duration: data?.recordingTime || data?.duration || 0,
        taskParam: paramValue,
        repeatIndex,
        timeStamp: data?.timestamp || Date.now(),
        snrScore: data?.snrScore || null,
        speechSegments: data?.speechSegments || null,
        payload: (!blob && !isSystemTask && !isMicCheck) || (isMicCheck && !blob) ? data : null, 
        progressAction: isAttempt    ? 'mic_check_attempt_saved'
              : isSystemTask ? `${currentTaskObj.type}_completed`
              : isMicCheck   ? 'mic_check_completed'
              : 'task_saved',
        isBlob: !!blob,
        isSystemTask: isSystemTask,
        isMicCheck: isMicCheck,
        isAttemptOnly: isAttempt
      };

      if (isSystemTask) {
        logInteraction(`${currentTaskObj.type}_completed`);
        if (!isAttempt) proceedToNext();
        return;
      }
   
      await saveRecordingLocally(recordingId, blob, uploadMeta);
   
      if (navigator.onLine) {
        uploadInBackground(recordingId, blob, uploadMeta, sessionId, taskIndex);
      }
   
      if (!isAttempt) {
        proceedToNext();
      }
   
    } catch (err) {
      console.error('handleTaskComplete error:', err);
      logToServer(`Task save error at index ${taskIndex}: ${err.message}`);
      if (!isAttempt) proceedToNext();
    }

    function proceedToNext() {
      if (taskIndex + 1 >= runtimeTasks.length) {
        trackProgress(sessionId, null, true);
        setTaskIndex((i) => i + 1); 
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
        localStorage.removeItem("neuroSHARE_tokenId"); // Clear token from localStorage once we're in the interface
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
      return (
        <MicCheck 
          onNext={(data) => handleTaskComplete(data, false)} 
          onSaveAttempt={(data) => handleTaskComplete(data, true)} 
          sessionId={sessionId} 
          token={accessToken} 
          onLogEvent={logInteraction}
        />
      );
    }

    const currentTask = resolveTask(rawTask, t);

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
        <VisionTaskWrapper 
          key={taskIndex}
          task={currentTask}
          onNextTask={handleTaskComplete}
        />
      );
    }

    if (currentTask.type === "cognitive") {
      return (
        <SDMTTask
          key={taskIndex}
          taskParams={currentTask.params}
          onComplete={handleTaskComplete} 
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
          <div className="task-header-row">
            
            <div className="task-header-left">
              {hasMultipleLanguages && taskIndex === 0 && (
                <button 
                  className="btn-lang" 
                  onClick={() => {
                    logInteraction("language_change_clicked");
                    // Redirect back to the loader, and pass the force flag!
                    navigate(`/participant/${accessToken}`, { 
                      replace: true, 
                      state: { forceLanguageSelector: true } 
                    });
                  }}
                >
                  ← {t("languageSelector.change", "Back")}
                </button>
              )}
            </div>

            <div className="task-header-center">
              {taskIndex < runtimeTasks.length && progressDisplay && !(isReadingTask && isRecordingActive) && (
                <div className="task-progress task-progress-inline">
                  {progressDisplay.label} {progressDisplay.current} / {progressDisplay.total}
                </div>
              )}
            </div>
            <div className="task-header-right"></div>

          </div>
          
          {/* Task Content */}
          {renderCurrentTask()}
        </div>
      </div>
    </div>
  );
}

// Handles the upload, the two-step IDB deletion, and the server progress update.
// Defined outside the component so it is stable and never recreated on render.
//
async function uploadInBackground(recordingId, blob, meta, sessionId, taskIndex) {
  if (activeUploads.has(recordingId)) return;
  activeUploads.add(recordingId);

  try {
    if (meta.isSystemTask) {
      // Do nothing API-wise
    } else if (meta.isMicCheck && meta.isBlob) {
      await uploadMicCheck(blob, meta);
    } else if (meta.isBlob) {
      await uploadRecording(blob, meta);
    } else {
      await saveTaskResult({
        sessionId: meta.sessionId,
        protocolTaskId: meta.protocolTaskId,
        repeat_index: meta.repeatIndex || 1,
        payload: meta.payload                               
      });
    }
 
    await markRecordingStatus(recordingId, 'uploaded');
    await deleteLocalRecording(recordingId);
 
    await trackProgress(sessionId, {
      action: meta.progressAction,
      protocolTaskId: meta.protocolTaskId,
      ...(meta.isAttemptOnly  && { snrScore: meta.snrScore }),
      ...(!meta.isAttemptOnly && !meta.isMicCheck && { taskIndex: meta.taskOrder }),
    });
    logToServer(`[BG Upload] task ${taskIndex} uploaded and removed from IDB ✓`);
 
  } catch (err) {
    logToServer(`[BG Upload] task ${taskIndex} failed (kept in IDB for retry): ${err.message}`);
  } finally {
    activeUploads.delete(recordingId);
  }
}
