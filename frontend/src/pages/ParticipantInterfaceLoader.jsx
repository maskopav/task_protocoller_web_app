// src/pages/ParticipantInterfaceLoader.jsx
import { useEffect, useState, useContext, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { fetchParticipantProtocol } from "../api/participantProtocols";
import { randomizeTasks } from '../utils/randomizer';
import { initSession } from "../api/sessions";
import { saveTaskResult } from "../api/taskResults"
import { logToServer } from "../utils/frontendLogger";
import ParticipantLanguageSelector from "../components/LanguageSwitcher/ParticipantLanguageSelector";

// ─── NEW IMPORTS ──────────────────────────────────────────────────────────────
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import {
  getPendingRecordingsForSession,
  markRecordingStatus,
  deleteLocalRecording,
  cleanupExpiredAndUploaded,
} from "../utils/offlineStorage";

// TODO: Replace with your actual import paths.
// uploadRecording should be your existing function that POSTs the blob to the server.
// trackProgress should POST to /api/sessions/progress.
// Both are likely already in your API layer; just export and import them here.
import { uploadRecording } from "../api/recordings";
import { trackProgress }  from "../api/sessions";
// ─────────────────────────────────────────────────────────────────────────────

export default function ParticipantInterfaceLoader() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(["common"]);
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { mappings } = useMappings();

  // Hold the raw data here if we need to ask the participant for their language
  const [pendingLangData, setPendingLangData] = useState(null);

  // 'loading' → 'slow' (5 s) → 'veryslow' (12 s)
  const [loadingPhase, setLoadingPhase] = useState('loading');

  // Refs so we can cancel timers from inside useCallback without adding them to deps
  const slowTimerRef     = useRef(null);
  const verySlowTimerRef = useRef(null);

  // Ref to track if we have already started initialization
  const lastLoadedToken = useRef(null);

  // Network status from the hook you already have
  const networkStatus = useNetworkStatus();

  // ── Startup: remove any expired or already-uploaded IDB records ─────────────
  useEffect(() => {
    cleanupExpiredAndUploaded();
    // Non-throwing — the function handles its own errors internally
  }, []);

  // ── Slow-loading timers ─────────────────────────────────────────────────────
  // Start counting from the moment this component mounts (= loading begins).
  // Both timers are cancelled inside finalizeLoad so they never fire after
  // successful navigation.
  useEffect(() => {
    slowTimerRef.current     = setTimeout(() => setLoadingPhase('slow'),     5_000);
    verySlowTimerRef.current = setTimeout(() => setLoadingPhase('veryslow'), 12_000);
    return () => {
      clearTimeout(slowTimerRef.current);
      clearTimeout(verySlowTimerRef.current);
    };
  }, []);

  // ── 1. Shared Error Handler ─────────────────────────────────────────────────
  const handleError = useCallback((e) => {
    clearTimeout(slowTimerRef.current);
    clearTimeout(verySlowTimerRef.current);

    let errorState = {};
    if (e.message && e.message.includes("active")) {
      errorState = { title: t("inactive.title"), message: t("inactive.message"), isWarning: true };
    } else if (e.message && e.message.includes("token")) {
      errorState = { title: t("invalidToken.title"), message: t("invalidToken.message"), isWarning: true };
    } else {
      errorState = {
        title:   t("error.title", "Unable to Load Protocol"),
        message: e.message || t("error.generic", "An unexpected error occurred."),
        isWarning: false,
      };
    }
    navigate("/error", { replace: true, state: errorState });
  }, [navigate, t]);

  // ── 2. Finalize Load Function ───────────────────────────────────────────────
  const finalizeLoad = useCallback(async (response, skipSelector = false) => {
    try {
      // Map data using existing helper
      const mappedProtocol = mapProtocol(response.protocol, mappings);
      mappedProtocol.available_languages = response.protocol.available_languages || [];
      mappedProtocol.project_protocol_id = response.project_protocol?.id;

      const forceLang = location.state?.forceLanguageSelector;

      // Apply randomization
      let randomizationSettings = response.protocol.randomization || {};
      let shuffledTasks = randomizeTasks(mappedProtocol.tasks, randomizationSettings);
      mappedProtocol.tasks = shuffledTasks;

      // Initialize session
      const taskOrder = shuffledTasks.map(t => t.protocol_task_id);
      let sessionId         = null;
      let startingTaskIndex = 0;
      let isResumed         = false;
      localStorage.setItem("neuroSHARE_tokenId", token);
      logToServer(`[DEBUG - Loader] Token explicitly saved to localStorage: ${token}`);

      try {
        const sessionData = await initSession({ token, taskOrder });
        sessionId = sessionData.sessionId;
        isResumed = sessionData.resumed || false;

        // If resuming, restore the EXACT order from the database
        if (isResumed && sessionData.taskOrder?.length > 0) {
          const savedOrder = sessionData.taskOrder.map(Number);
          shuffledTasks = [...mappedProtocol.tasks].sort((a, b) =>
            savedOrder.indexOf(Number(a.protocol_task_id)) -
            savedOrder.indexOf(Number(b.protocol_task_id))
          );
        }

        if (sessionData.currentTaskIndex !== undefined) {
          startingTaskIndex = Math.max(0, parseInt(sessionData.currentTaskIndex, 10) - 1);
        }

        logToServer(
          isResumed
            ? `Resumed session: ${sessionId} at server index ${startingTaskIndex}`
            : `New session started: ${sessionId}`
        );
      } catch (err) {
        console.error("Warning: Could not init session, proceeding anyway", err);
      }

      // ── IDB FLUSH ON RESUME ──────────────────────────────────────────────
      // Check what is safely stored in IndexedDB and advance the starting index.
      // We do this whether they are online or offline!
      if (isResumed && sessionId) {
        startingTaskIndex = await calculateOfflineProgress(
          sessionId,
          startingTaskIndex,
          logToServer
        );
      }
      // ────────────────────────────────────────────────────────────────────

      // If multiple languages exist AND this is not a resumed session, pause
      if (!skipSelector && (!isResumed || forceLang) && response.protocol.available_languages?.length > 1) {
        setPendingLangData({
          originalResponse: response,
          mappedProtocol,
          shuffledTasks,
          sessionId,
          startingTaskIndex,
          isResumed: false,
        });
        return;
      }

      // Cancel slow-loading timers — we are about to navigate successfully
      clearTimeout(slowTimerRef.current);
      clearTimeout(verySlowTimerRef.current);

      mappedProtocol.tasks = shuffledTasks;
      setSelectedProtocol(mappedProtocol);

      const shouldShowResumedAlert = isResumed && !forceLang && !skipSelector;

      navigate("/participant/interface", {
        replace: true,
        state: {
          protocol: mappedProtocol,
          testingMode: false,
          editingMode: false,
          participant: response.participant,
          token,
          sessionId,
          startingTaskIndex,
          isResumed: shouldShowResumedAlert,
          loadTimestamp: Date.now(),
        },
      });

    } catch (e) {
      console.error("Finalization error:", e);
      handleError(e);
    }
  }, [mappings, navigate, setSelectedProtocol, token, handleError, location.state]);

  // ── 3. Main Load Function ───────────────────────────────────────────────────
  const load = useCallback(async (skipSelector = false) => {
    sessionStorage.setItem('originalParticipantUrl', window.location.href);
    try {
      const response = await fetchParticipantProtocol(token);
      if (!response.protocol) throw new Error("Protocol missing");
      await finalizeLoad(response, skipSelector);
    } catch (e) {
      handleError(e);
    }
  }, [token, finalizeLoad, handleError]);

  // ── 4. Trigger Load on Mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!mappings || !mappings.languages || !mappings.tasks) return;
    if (lastLoadedToken.current === token) return;
    
    lastLoadedToken.current = token;
    load(location.state?.skipLanguageSelector);
  }, [token, mappings, load, location.state]);

  // ── 5. Render Language Selector (if intercepted) ────────────────────────────
  if (pendingLangData) {
    return (
      <ParticipantLanguageSelector
        languages={pendingLangData.originalResponse.protocol.available_languages}
        currentAssignedId={pendingLangData.originalResponse.project_protocol.id}
        token={token}
        onConfirm={() => {
          const { originalResponse, mappedProtocol, shuffledTasks, sessionId, startingTaskIndex, isResumed } = pendingLangData;
          setPendingLangData(null);

          mappedProtocol.tasks = shuffledTasks;
          setSelectedProtocol(mappedProtocol);

          navigate("/participant/interface", {
            replace: true,
            state: {
              protocol: mappedProtocol,
              testingMode: false,
              editingMode: false,
              participant: originalResponse.participant,
              token,
              sessionId,
              startingTaskIndex,
              isResumed,
              loadTimestamp: Date.now(),
            },
          });
        }}
        onSwap={() => {
          setPendingLangData(null);
          sessionStorage.setItem("justSwitchedLanguage", "true");
          load(true);
        }}
      />
    );
  }

  // ── 6. Loading Screen ───────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <LoadingScreen phase={loadingPhase} networkStatus={networkStatus} t={t} />
    </div>
  );
}

// ─── Loading Screen Component ─────────────────────────────────────────────────
// Shown while the Loader is fetching and initializing.
// Intentionally minimal — no spinners, no progress bars, just clear text.
// Phases: loading (default) → slow (5 s) → veryslow (12 s)
// networkStatus overrides the phase copy when the device is offline.

function LoadingScreen({ phase, networkStatus, t }) {
  const isOffline = networkStatus === 'offline';

  // Primary line: what is happening
  let primary;
  if (isOffline) {
    primary = t("loading.offline", "You appear to be offline.");
  } else if (phase === 'veryslow') {
    primary = t("loading.verySlow", "Still trying to connect…");
  } else if (phase === 'slow') {
    primary = t("loading.slow", "This is taking longer than usual.");
  } else {
    primary = t("loading", "Loading…");
  }

  // Secondary line: only shown once things are slow or offline
  let secondary = null;
  if (isOffline) {
    secondary = t(
      "loading.offlineHint",
      "Please connect to the internet. If you were in the middle of a task, your recordings are saved on this device and will be uploaded automatically when the connection returns."
    );
  } else if (phase === 'slow' || phase === 'veryslow') {
    secondary = t(
      "loading.slowHint",
      "Please check your internet connection. If the problem continues, try refreshing the page — you will be returned to where you left off."
    );
  }

  return (
    <>
      <p className="participant-loading__primary">{primary}</p>
      {secondary && (
        <p className="participant-loading__hint">{secondary}</p>
      )}
    </>
  );
}

// ─── IDB Read & Skip Helper ───────────────────────────────────────────────────
// Reads pending recordings from IDB and fast-forwards the starting task index.
// We DO NOT upload here—that blocks the UI and forces repeats if offline.
// Uploads are handled gracefully by ParticipantInterfacePage in the background.
async function calculateOfflineProgress(sessionId, startingTaskIndex, logFn) {
  try {
    const pending = await getPendingRecordingsForSession(sessionId);
    if (pending.length === 0) return startingTaskIndex;

    logFn(`[IDB Resume] Found ${pending.length} pending recording(s) locally.`);

    let adjustedStart = startingTaskIndex;

    for (const record of pending) {
      const taskIdx = record.metadata?.taskIndex;

      // If there is a gap, stop skipping. (e.g. server says we are at task 2, 
      // but IDB only has a record for task 4 — something is wrong, play it safe).
      if (taskIdx === undefined || taskIdx !== adjustedStart) {
        logFn(`[IDB Resume] Gap detected — expected task ${adjustedStart}, found task ${taskIdx}. Stopping skip.`);
        break;
      }

      // Task exists locally! The user already did it. We skip it.
      adjustedStart++;
      logFn(`[IDB Resume] Skipping task ${taskIdx} (already completed offline). New start: ${adjustedStart}`);
    }

    return adjustedStart;

  } catch (err) {
    logFn(`[IDB Resume] Fatal error reading IDB: ${err.message}`);
    return startingTaskIndex;
  }
}

// ─── Protocol Mapping Helper ──────────────────────────────────────────────────
// (unchanged from original)
function mapProtocol(raw, mappings) {
  const language = mappings.languages.find(l => l.id === raw.language_id);
  const mappedTasks = raw.tasks.map(t => {
    const taskDef = mappings.tasks.find(def => def.id === t.task_id);
    return {
      ...t.params,
      category: taskDef?.category || "unknown",
      task_order: t.task_order,
      protocol_task_id: t.protocol_task_id
    };
  });
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version,
    description: raw.description,
    protocol_group_id: raw.protocol_group_id,
    language: language?.code || "en",
    tasks: mappedTasks,
    randomization: raw.randomization,
    required_identifiers: raw.required_identifiers,
    info_text: raw.info_text,
    consent_text: raw.consent_text
  };
}