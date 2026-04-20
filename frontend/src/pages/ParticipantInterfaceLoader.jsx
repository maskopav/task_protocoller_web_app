// src/pages/ParticipantInterfaceLoader.jsx
import { useEffect, useState, useContext, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { fetchParticipantProtocol } from "../api/participantProtocols";
import { randomizeTasks } from '../utils/randomizer';
import { initSession } from "../api/sessions";
import { logToServer } from "../utils/frontendLogger";
import ParticipantLanguageSelector from "../components/LanguageSwitcher/ParticipantLanguageSelector";

export default function ParticipantInterfaceLoader() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { mappings } = useMappings();
  
  // Hold the raw data here if we need to ask the participant for their language
  const [pendingLangData, setPendingLangData] = useState(null);

  // Ref to track if we have already started initialization
  const lastLoadedToken = useRef(null);

  // 1. Shared Error Handler
  const handleError = useCallback((e) => {
    let errorState = {};
    if (e.message && e.message.includes("active")) {
      errorState = { title: t("inactive.title"), message: t("inactive.message"), isWarning: true };
    } else if (e.message && e.message.includes("token")) {
      errorState = { title: t("invalidToken.title"), message: t("invalidToken.message"), isWarning: true };
    } else {
      errorState = { title: t("error.title", "Unable to Load Protocol"), message: e.message || t("error.generic", "An unexpected error occurred."), isWarning: false };
    }
    navigate("/error", { replace: true, state: errorState });
  }, [navigate, t]);

  // 2. Finalize Load Function (Handles Mapping, Sessions, and Navigation)
  const finalizeLoad = useCallback(async (response) => {
    try {
      // Map Data using existing function
      const mappedProtocol = mapProtocol(response.protocol, mappings);

      // Apply Randomization
      let randomizationSettings = response.protocol.randomization || {};
      let shuffledTasks = randomizeTasks(mappedProtocol.tasks, randomizationSettings);
      mappedProtocol.tasks = shuffledTasks;

      // Initialize Session
      const taskOrder = shuffledTasks.map(t => t.protocol_task_id);
      let sessionId = null;
      let startingTaskIndex = 0;
      let isResumed = false;

      try {
        const sessionData = await initSession({ token, taskOrder });
        sessionId = sessionData.sessionId;
        isResumed = sessionData.resumed || false;

        // If resuming, restore the EXACT order from the database
        if (isResumed && sessionData.taskOrder && sessionData.taskOrder.length > 0) {
          const savedOrder = sessionData.taskOrder.map(Number); 
          shuffledTasks = [...mappedProtocol.tasks].sort((a, b) => {
            return savedOrder.indexOf(Number(a.protocol_task_id)) - savedOrder.indexOf(Number(b.protocol_task_id));
          });
        }

        if (sessionData.currentTaskIndex !== undefined) {
          startingTaskIndex = Math.max(0, parseInt(sessionData.currentTaskIndex, 10) - 1);
        }
        
        logToServer(isResumed ? `Resumed session: ${sessionId} at index ${startingTaskIndex}` : `New session started: ${sessionId}`);
      } catch (err) {
        console.error("Warning: Could not init session, proceeding anyway", err);
      }

      // Save to global context
      mappedProtocol.tasks = shuffledTasks;
      setSelectedProtocol(mappedProtocol);

      // Navigate to real participant interface
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
          isResumed
        }
      });
    } catch (e) {
      handleError(e);
    }
  }, [mappings, navigate, setSelectedProtocol, token, handleError]);

  // 3. Main Load Function (Fetches data and intercepts if multiple languages)
  const load = useCallback(async (skipSelector = false) => {
    sessionStorage.setItem('originalParticipantUrl', window.location.href);
    try {
      const response = await fetchParticipantProtocol(token);
      if (!response.protocol) throw new Error("Protocol missing");

      console.log("Fetched participant protocol:", response);

      // Intercept: If multiple languages exist, pause and show the selector!
      if (!skipSelector && response.protocol.available_languages?.length > 1) {
        setPendingLangData(response); 
        return; 
      }

      // Single language: Proceed directly to finalization
      await finalizeLoad(response);

    } catch (e) {
      handleError(e);
    }
  }, [token, finalizeLoad, handleError]);

  // 4. Trigger Load on Mount
  useEffect(() => {
    if (!mappings || !mappings.languages || !mappings.tasks) return;
    if (lastLoadedToken.current === token) return;
    
    lastLoadedToken.current = token;
    load();
  }, [token, mappings, load]);

  // 5. Render Language Selector (if intercepted)
  if (pendingLangData) {
    return (
      <ParticipantLanguageSelector 
        languages={pendingLangData.protocol.available_languages}
        currentAssignedId={pendingLangData.project_protocol.id}
        token={token}
        onConfirm={() => {
           setPendingLangData(null);
           finalizeLoad(pendingLangData);
        }}
        onSwap={() => {
           setPendingLangData(null);
           load(true); // Skip selector on reload since they just swapped
        }}
      />
    );
  }

  // 6. Render Loading Screen
  return <div className="app-container"><p>{t("loading", "Loading...")}</p></div>;
}

// --- helper ---
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
    info_text: raw.info_text,
    consent_text: raw.consent_text
  };
}