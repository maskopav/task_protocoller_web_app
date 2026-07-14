// src/pages/ParticipantInterfacePage.jsx
import React, { useState, useContext, useMemo, useEffect, useRef, useCallback } from "react";
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
import Identifiers from "../components/Identifiers/Identifiers";
import MicCheck from "../components/Recorder/MicCheck";
import VolumeCheck from "../components/VolumeCheck/VolumeCheck";
import SDMTTask from "../components/SDMTTask/SDMTTask";
import { trackProgress } from "../api/sessions";
import { uploadRecording, uploadMicCheck } from "../api/recordings";
import { saveTaskResult } from "../api/taskResults";
import { getTaskProgressDisplay, checkCompletionOverlay } from "../utils/progressTracker";
import { ConfirmDialogContext } from "../components/ConfirmDialog/ConfirmDialogContext";
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
import { getAudioGuidePath, getCompletionAudioPath, getTopicAudioPath } from '../utils/getAudioGuidePath';
import { TaskAudioProvider } from '../context/TaskAudioContext';
import AudioGuidePlayer from '../components/AudioGuidePlayer/AudioGuidePlayer';

const activeUploads = new Set();


export default function ParticipantInterfacePage() {
  const { i18n, t } = useTranslation(["tasks", "common", "admin"]);
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm, isDialogOpen } = useContext(ConfirmDialogContext);
  const originalTasks = location.state?.originalTasks;
  const previewRandomized = location.state?.previewRandomized;
  const { selectedProtocol, setSelectedProtocol } = useContext(ProtocolContext);
  const startingTaskIndex = parseInt(location.state?.startingTaskIndex || 0, 10);
  const isResumed = location.state?.isResumed || false;

  const [taskIndex, setTaskIndex] = useState(startingTaskIndex);
  const [langReady, setLangReady] = useState(false);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  // True while a getUserMedia() call is in flight (native permission dialog
  // may be up). Combined with isRecordingActive below so the header audio
  // guide pauses/hides for this window too — no way to detect the dialog
  // itself, so we suppress audio for the whole request instead.
  const [isAwaitingPermission, setIsAwaitingPermission] = useState(false);
  const generalGuideRef = useRef(null);
  const topicGuideRef = useRef(null);
  const stopAudioGuides = useCallback(() => {
    generalGuideRef.current?.stop();
    topicGuideRef.current?.stop();
  }, []);

  const [audioPhase, setAudioPhase] = useState('instructions'); // 'instructions' | 'completed'
  const [playTrigger, setPlayTrigger] = useState(0);
  const [pendingAudio, setPendingAudio] = useState(false);
  // Which guide clip the mic_check task currently needs: 'permission' while
  // MicCheck is on its permission-explanation intro screen, 'calibration'
  // once it's actually running the noise/counting recording. Reported by
  // MicCheck itself via onPhaseChange, since only it knows its sub-phase.
  const [micCheckGuideStage, setMicCheckGuideStage] = useState(null);

  // For dynamic tasks (dynamic_monologue, everyday, etc.): which topic is
  // currently active, reported up by Recorder via onTopicChange.
  const [topicState, setTopicState] = useState({ index: 0, topic: null });
  // 'general' = the task-level instructions clip plays; 'topic' = we've moved
  // on to per-topic clips and the general one should no longer show/play.
  const [guideStage, setGuideStage] = useState('general');
  const [topicPlayTrigger, setTopicPlayTrigger] = useState(0);
  const [storyPlayTrigger, setStoryPlayTrigger] = useState(0);
  const playedMicCheckStages = useRef(new Set());

  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    if (startingTaskIndex > 0) {
      setTaskIndex(startingTaskIndex);
    }
  }, [startingTaskIndex]);

  // Add state for the completionoverlay
  const [showPraise, setShowPraise] = useState(false);
  const [completedCategory, setCompletedCategory] = useState(null);

  // Tracks recordings sitting in IDB that have not yet reached the server.
  // Drives the "still uploading" banner on the CompletionScreen.
  const [pendingUploadCount, setPendingUploadCount] = useState(null);
  const completionAckedRef = useRef(false);
  const completionInFlightRef = useRef(false);

  const [isUploading, setIsUploading] = useState(false);
  const isUploadingRef = useRef(false);

  // Add a Ref to track the last logged task 
  // We initialize it to -1 so that index 0 is always logged the first time.
  const lastLoggedIndex = useRef(-1);

  const [recorderPhase, setRecorderPhase] = useState(null);
  const playedRecorderPhases = useRef(new Set());

  const testingMode = location.state?.testingMode ?? false;
  const editingMode = location.state?.editingMode ?? false;
  const protocolData = location.state?.protocol || selectedProtocol;  
  const randomStrategy = protocolData?.randomization?.strategy || 'none';
  const moduleSettings = protocolData?.randomization?.moduleSettings || {};
  // Extract language info to know if we should show the button
  const availableLanguages = protocolData?.available_languages || [];
  const hasMultipleLanguages = availableLanguages.length > 1;
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

    // Add Volume Check — first thing shown, right after the language switcher
    introSteps.push({
      type: "volume_check",
      category: "volume_check",
      isSystemTask: true
    });

    // Helper to find content by type in the global_contents array
    const findGlobalContent = (type) => {
      return selectedProtocol.global_contents?.find(c => c.type === type)?.html;
    };

    // Add Info Page (check root field OR new array)
    const infoHtml = selectedProtocol.info_text || findGlobalContent('info');
    if (infoHtml) {
      introSteps.push({
        type: "info",
        content: infoHtml,
        category: "info",
        isSystemTask: true
      });
    }

    // Add Consent Page (check root field OR new array)
    const consentHtml = selectedProtocol.consent_text || findGlobalContent('consent');
    if (consentHtml) {
      introSteps.push({
        type: "consent",
        content: consentHtml,
        category: "consent",
        isSystemTask: true
      });
    }

    // Add Identifiers
    if (selectedProtocol.required_identifiers && selectedProtocol.required_identifiers.length > 0) {
      introSteps.push({
        type: "identifiers",
        category: "identifiers",
        isSystemTask: true 
      });
    }

    // Prepare Tasks
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
            } else if (record.metadata.isMicCheck) {
              // Mic-check "skipped" event with no audio — nothing to persist to task_results.
              // Progress (skipped, attempts) is captured via trackProgress below instead.
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
              action: record.metadata.progressAction,
              protocolTaskId: record.metadata.protocolTaskId,
              ...(record.metadata.isAttemptOnly  && { snrScore: record.metadata.snrScore }),
              ...(!record.metadata.isAttemptOnly && !record.metadata.isMicCheck && { taskIndex: record.metadata.taskOrder }),
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

  // Poll IDB while the CompletionScreen is visible so the participant sees live
  // upload status and we know when it is safe to clear the localStorage token.
  const isOnCompletionScreen = taskIndex >= runtimeTasks.length && runtimeTasks.length > 0;
  useEffect(() => {
    if (!isOnCompletionScreen || !sessionId) return;

    async function checkPending() {
      try {
        const pending = await getPendingRecordingsForSession(sessionId);
        setPendingUploadCount(pending.length);

        if (pending.length === 0) {
          if (!completionAckedRef.current && !completionInFlightRef.current) {
            completionInFlightRef.current = true;
            try {
              await trackProgress(sessionId, null, true);
              completionAckedRef.current = true;
            } catch (err) {
              logToServer(`[Completion] Failed to mark session complete, will retry: ${err.message}`);
            } finally {
              completionInFlightRef.current = false;
            }
          }

          // All data is on the server — safe to drop the token now.
          localStorage.removeItem("neuroSHARE_tokenId");
        }
      } catch {
        // Silently ignore IDB read errors here; data is not lost.
      }
    }

    checkPending();                              // Check immediately on mount/change
    const interval = setInterval(checkPending, 3_000); // Then every 3 s
    return () => clearInterval(interval);
  }, [isOnCompletionScreen, sessionId, networkStatus]); // Re-run when network returns


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

  // Define your tasks and audio hook FIRST
  const rawTask = runtimeTasks[taskIndex];
  
  const { currentTask, isReadingTask, isRetellingTask } = useMemo(() => {
    let task = null;
    let isReading = false;
    let isRetelling = false;

    if (rawTask && !['info', 'consent', 'mic_check', 'identifiers', 'volume_check'].includes(rawTask.type)) {
       task = resolveTask(rawTask, t);
       isReading = task?.category === 'reading';
       isRetelling = task?.category === 'retelling';
    }
    
    return { currentTask: task, isReadingTask: isReading, isRetellingTask: isRetelling };
  }, [rawTask, t]);

  // A task uses the camera-permission/calibration flow if it's a camera task OR a
  // voice task with recordVideo on (retelling with video, etc.). recordVideo is
  // stored as the string "true"/"false", matching Recorder.jsx's own check.
  const isVideoTask = currentTask?.type === 'camera'
    || currentTask?.resolvedParams?.recordVideo === 'true';

  // --- Retrieve audio guide state (on/off) ---
  // MariaDB returns BOOLEAN as 0/1 — `?? true` only covers the missing case, !! normalizes the rest
  const useAudioGuide = !!(protocolData?.use_audio_guide ?? true);

  const audioSrc = useMemo(() => {
    if (!rawTask || !useAudioGuide) return null;

    // All questionnaire categories (generic + standard ones like rbdsq/hhies)
    // share the same audio guide clip, since their content
    // is dynamic and can't be pre-recorded per task.
    let taskName = rawTask.type === 'questionnaire' ? 'questionnaire' : rawTask.category;

    if (rawTask.type === 'mic_check' && micCheckGuideStage) {
      const micCheckAudioMap = {
        'permission': 'mic_permission',
        'calibration': 'audio_setup',
        'success': 'mic_success',
        'failed': 'mic_failed',      // General background noise
        'muted': 'mic_muted',        
        'warning': 'mic_warning'
      };
      taskName = micCheckAudioMap[micCheckGuideStage] || 'audio_setup';
    } else if (currentTask?.params?.recordVideo === 'true' && recorderPhase === 'PERMISSION') {
      taskName = 'camera_permission'; 
    }
    const repeatIndex = currentTask?._repeatIndex || 1; 
    const taskParams = currentTask?.params || {};

    return getAudioGuidePath(
      taskName,
      taskParams, 
      repeatIndex,
      i18n.language
    );
  }, [rawTask, currentTask, i18n.language, useAudioGuide, micCheckGuideStage, recorderPhase]);

  // New task opened -> if audio guide on, switch to instructions and force a play
  useEffect(() => {
    playedMicCheckStages.current.clear();
    playedRecorderPhases.current.clear();
    setAudioPhase('instructions');
    setGuideStage('general');
    if (rawTask?.type === 'mic_check') {
      setMicCheckGuideStage(null);
    } else if (isVideoTask) {
      setRecorderPhase(null);
    } else {
      setPendingAudio(true);
    }
  }, [taskIndex]);

  useEffect(() => {
    if (isVideoTask && recorderPhase) {
      // Group all non-permission phases (SETUP, CALIBRATE, RECORDING) into 'instructions'
      const audioStage = recorderPhase === 'PERMISSION' ? 'permission' : 'instructions';
      
      if (!playedRecorderPhases.current.has(audioStage)) {
        if (audioStage === 'permission') {
          // Add a slight delay. If permission is already granted, it will skip this phase instantly
          // and we avoid flashing the permission audio.
          const timer = setTimeout(() => {
            setAudioPhase('instructions');
            setGuideStage('general');
            setPendingAudio(true);
            playedRecorderPhases.current.add(audioStage);
          }, 300);
          return () => clearTimeout(timer);
        } else {
          setAudioPhase('instructions');
          setGuideStage('general');
          setPendingAudio(true);
          playedRecorderPhases.current.add(audioStage);
        }
      }
    }
  }, [recorderPhase, currentTask]);

  // Fires the right guide clip each time MicCheck moves between its
  // permission-gate and calibration-recording sub-stages.
  useEffect(() => {
    if (micCheckGuideStage) {
      setAudioPhase('instructions');
      // If we haven't played this specific stage yet, trigger autoplay
      if (!playedMicCheckStages.current.has(micCheckGuideStage)) {
        setPendingAudio(true);
        playedMicCheckStages.current.add(micCheckGuideStage);
      } else {
        // If it's a retry/repeat, don't trigger play. The icon will just be visible.
        setPendingAudio(false); 
      }
    }
  }, [micCheckGuideStage]);

  // Watch the audio queue and the dialog state
  useEffect(() => {
    if (pendingAudio) {
      // Short delay gives child components (like SDMT) time to mount and open their dialogs
      const timer = setTimeout(() => {
        if (!isDialogOpen) {
          setPlayTrigger(t => t + 1);
          setPendingAudio(false); // Audio triggered, clear the queue
        }
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [pendingAudio, isDialogOpen]);

  const completedAudioSrc = useMemo(
    () => useAudioGuide ? getCompletionAudioPath(i18n.language) : null,
    [i18n.language, useAudioGuide]
  );

  // Reported by Recorder via onTopicChange whenever the active dynamic-task topic changes.
  const handleTopicChange = useCallback((index, topic) => {
    setTopicState({ index, topic });
    
    if (index > 0) {
       setGuideStage('topic');
    }
  }, []);

  // Per-topic guide clip for the currently active topic, e.g. dynamic_monologue_family.m4a
  const topicAudioSrc = useMemo(() => {
    if (!rawTask || !useAudioGuide || topicState.topic == null) return null;

    let topicIdentifier = topicState.topic;

    // If the topic is a resolved object, we need the original string ID (e.g., 'everyday')
    if (typeof topicState.topic === 'object') {
      // First try to see if the resolved object kept the id
      if (topicState.topic.id) {
        topicIdentifier = topicState.topic.id;
      } 
      // Fallback: look up the original string array from currentTask.params using the current index
      else if (currentTask?.params) {
        const originalArray = Object.values(currentTask.params).find(val => Array.isArray(val));
        if (originalArray && originalArray[topicState.index]) {
          topicIdentifier = originalArray[topicState.index];
        }
      }
    }

    return getTopicAudioPath(rawTask.category, topicIdentifier, i18n.language);
  }, [rawTask, useAudioGuide, topicState.topic, topicState.index, currentTask, i18n.language]);

  // Called when the general instructions clip finishes (or fails to load) —
  // hands off to the per-topic clip for whichever topic is active.
  const handleGeneralGuideEnded = useCallback(() => {
    // Do not trigger the next steps (like the story) if it was just the permission audio that ended!
    if (currentTask?.params?.recordVideo === 'true' && recorderPhase === 'PERMISSION') {
      return; 
    }

    // Only hand off to the per-topic clip if there's actually a topic to play.
    if (guideStage === 'general' && topicState.topic != null) {
      setGuideStage('topic');
      setTopicPlayTrigger(t => t + 1);
      return;
    }
    if (isRetellingTask && useAudioGuide) {
      setStoryPlayTrigger(t => t + 1);
    }
  }, [currentTask, recorderPhase, guideStage, topicState, isRetellingTask, useAudioGuide]);

  // If there's no general clip to play at all for this task (feature off, or
  // no file for this task/param combo), skip straight to the topic clip
  // instead of waiting forever for an 'ended' event that will never fire.
  useEffect(() => {
    // Prevent this fallback from triggering the story while we are still on the permission screen
    if (currentTask?.params?.recordVideo === 'true' && recorderPhase === 'PERMISSION') {
        return;
    }

    if (isRetellingTask && useAudioGuide && guideStage === 'general' &&
        !audioSrc && topicState.topic == null) {
      setStoryPlayTrigger(t => t + 1);
    }
  }, [isRetellingTask, useAudioGuide, guideStage, audioSrc, topicState.topic, currentTask, recorderPhase]);

  // Once we've handed off to per-topic clips, re-trigger playback every time
  // the topic actually changes (e.g. the participant switches topics mid-task).
  useEffect(() => {
    if (guideStage === 'topic') {
      setTopicPlayTrigger(t => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicState.index]);

  useEffect(() => {
    if (isRetellingTask && useAudioGuide && guideStage === 'general' &&
        !audioSrc && topicState.topic == null) {
      setStoryPlayTrigger(t => t + 1);
    }
  }, [isRetellingTask, useAudioGuide, guideStage, audioSrc, topicState.topic]);

  const handleRecorderAudioEvent = useCallback((eventType) => {
    if (eventType === 'completed') {
      setAudioPhase('completed');
      setPlayTrigger(t => t + 1);   // force play of the "completed" clip
    } else if (eventType === 'retry') {
      setAudioPhase('instructions'); // src reverts, but playTrigger stays the same → no autoplay
      setGuideStage('general');     
    }
  }, []); // <-- Empty dependency array ensures the reference never changes

  // Only one of these is non-null at a time: the general clip while guideStage
  // is 'general', the matching topic clip once we've handed off to 'topic',
  // and the "completed" clip always wins once the recording is done.
  const headerGeneralAudioSrc = audioPhase === 'completed'
    ? completedAudioSrc
    : (guideStage === 'general' ? audioSrc : null);

  const headerTopicAudioSrc = audioPhase === 'completed'
    ? null
    : (guideStage === 'topic' ? topicAudioSrc : null);

  // --- Early returns ---
  if (needsRedirect) {
    return <div className="app-container"><p>{t("loading", "Loading…")}</p></div>;
  }
  if (!langReady) {
    return <div className="app-container"><p>{t("loading", "Loading translations…")}</p></div>;
  }

  async function handleTaskComplete(data, isAttempt = false) {
    if (!isAttempt) {
      if (isUploadingRef.current) return;
      isUploadingRef.current = true;
      setIsUploading(true);
    }
    try {
      const currentTaskObj = runtimeTasks[taskIndex];
      const isSystemTask = ['info', 'consent', 'identifiers', 'volume_check'].includes(currentTaskObj.type);
      const isMicCheck = currentTaskObj.type === 'mic_check';
    
      if (testingMode || editingMode || !sessionId) {
        if (!isAttempt) proceedToNext();
        return;
      }
   
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
      // Extract videoData from the incoming data object if it exists
      const videoData = data.videoData || null;

   
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
        videoData: videoData,
        payload: (!blob && !isSystemTask && !isMicCheck) || (isMicCheck && !blob) ? data : null, 
        attemptNumber: data?.attemptNumber,
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
        await uploadInBackground(recordingId, blob, uploadMeta, sessionId, taskIndex);
      }
   
      if (!isAttempt) {
        proceedToNext();
      }
   
    } catch (err) {
      console.error('handleTaskComplete error:', err);
      logToServer(`Task save error at index ${taskIndex}: ${err.message}`);
      if (!isAttempt) proceedToNext();
    } finally {
      if (!isAttempt) {
        isUploadingRef.current = false;
        setIsUploading(false);
      }
    }

    function proceedToNext() {
      if (taskIndex + 1 >= runtimeTasks.length) {
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

  const renderCurrentTask = () => {
    if (!rawTask) {
      // Token removal is handled by the polling effect once IDB is confirmed empty —
      // do NOT remove it here, or a refresh mid-upload breaks the self-heal path.
      return (
        <CompletionScreen
          testingMode={testingMode}
          onBack={handleBack}
          pendingUploadCount={pendingUploadCount}
          networkStatus={networkStatus}
          audioGuideEnabled={useAudioGuide}
        />
      );
    }
    
    // Render Volume Check
    if (rawTask.type === "volume_check") {
      return (
        <VolumeCheck onComplete={(data) => handleTaskComplete(data)} audioGuideEnabled={useAudioGuide} />
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

    // Render Identifiers Page
    if (rawTask.type === "identifiers") {
      return (
        <Identifiers 
          requiredIdentifiers={selectedProtocol.required_identifiers} 
          onNext={() => handleTaskComplete({ type: 'identifiers' })} 
          sessionId={sessionId}
          token={accessToken}
        />
      );
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
          onPhaseChange={(phase, errorType) => { // <-- Receive errorType
            const phaseMap = {
              'intro': 'permission',
              'noise': 'calibration',
              'noise-success': 'success',
              'noise-failed': errorType === 'muted' ? 'muted' : 'failed', 
              'warning': 'warning'
            };
            const mappedStage = phaseMap[phase];
            if (mappedStage && mappedStage !== micCheckGuideStage) {
              setMicCheckGuideStage(mappedStage);
            }
          }}
          isUploading={isUploading}
          onPermissionPending={setIsAwaitingPermission}
          onRecordingStateChange={setIsRecordingActive}
        />
      );
    }

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
          onAudioEvent={handleRecorderAudioEvent}
          isUploading={isUploading}
          onPermissionPending={setIsAwaitingPermission}
          onTopicChange={handleTopicChange}
          onPhaseChange={setRecorderPhase}
          autoPlayStoryTrigger={storyPlayTrigger}
          onBeforeRecordingStart={stopAudioGuides}
          onExamplePlay={stopAudioGuides}
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
          isUploading={isUploading}
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
          isUploading={isUploading}
          audioGuideEnabled={useAudioGuide}
        />
      );
    }

    if (currentTask.type === "cognitive") {
      return (
        <SDMTTask
          key={taskIndex}
          taskParams={currentTask.params}
          onComplete={handleTaskComplete}
          isUploading={isUploading}
          onTaskActiveChange={setIsRecordingActive}
          onAudioEvent={handleRecorderAudioEvent}
          audioGuideEnabled={useAudioGuide}
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
            <div className="task-header-right">
              <AudioGuidePlayer
                ref={generalGuideRef}
                src={headerGeneralAudioSrc}
                playTrigger={playTrigger}
                isRecordingActive={isRecordingActive || isAwaitingPermission || isDialogOpen}
                onEnded={handleGeneralGuideEnded}
              />
              <AudioGuidePlayer
                ref={topicGuideRef}
                src={headerTopicAudioSrc}
                playTrigger={topicPlayTrigger}
                isRecordingActive={isRecordingActive || isAwaitingPermission || isDialogOpen}
              />
            </div>

          </div>

          <TaskAudioProvider src={audioSrc}>
            {/* Task Content */}
            {renderCurrentTask()}
          </TaskAudioProvider>
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
    } else if (meta.isMicCheck) {
      // Mic-check "skipped" event with no audio — nothing to persist to task_results.
      // Progress (skipped, attempts) is captured via trackProgress below instead.
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