// src/pages/ParticipantInterfaceLoader.jsx
import { useEffect, useState, useContext, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProtocolContext } from "../context/ProtocolContext";
import { useMappings } from "../context/MappingContext";
import { fetchParticipantProtocol } from "../api/participantProtocols";
import { randomizeTasks } from '../utils/randomizer';
import { initSession } from "../api/sessions";

export default function ParticipantInterfaceLoader() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);
  const { setSelectedProtocol } = useContext(ProtocolContext);
  const { mappings } = useMappings();

  // Ref to track if we have already started initialization
  const lastLoadedToken = useRef(null);

  useEffect(() => {
    // Ensure mappings (languages and tasks) are loaded before running logic.
    // This effect will re-run automatically when 'mappings' updates.
    if (!mappings || !mappings.languages || !mappings.tasks) {
      return;
    }

    // Check if we have already loaded THIS specific token
    // If the token matches the last one we processed, stop.
    if (lastLoadedToken.current === token) {
      return;
    }

    // Mark this token as processed immediately
    lastLoadedToken.current = token;

    async function load() {
      try {
        // 1. call backend to resolve token
        const response = await fetchParticipantProtocol(token);
        console.log(response);
        // response contains:
        // {
        //   participant: {...}
        //   project_protocol: {...}
        //   protocol: {... raw protocol ...}
        // }
        const rawProtocol = response.protocol;
        if (!rawProtocol) throw new Error("Protocol missing");

        // 2. Map Data using existing function
        const mappedProtocol = mapProtocol(rawProtocol, mappings);

        // 3: Apply Randomization
        // We use the settings from the protocol to shuffle the mapped tasks
        let randomizationSettings = rawProtocol.randomization || {};
        const shuffledTasks = randomizeTasks(mappedProtocol.tasks, randomizationSettings);
        
        // Update the protocol object with the new order
        console.log(mappedProtocol.tasks)
        console.log(shuffledTasks)
        mappedProtocol.tasks = shuffledTasks;

        // 4: Initialize Session with the specific task order
        // We extract the IDs to send to the backend
        const taskOrder = shuffledTasks.map(t => t.protocol_task_id);

        // We do this in parallel or sequence. Sequence is safer to ensure we have a session ID.
        let sessionId = null;
        try {
            const sessionData = await initSession(
              token, 
              taskOrder // Send the shuffled order to DB
            );
            sessionId = sessionData.sessionId;
            console.log("Session started:", sessionId);
        } catch (err) {
            console.error("Warning: Could not init session, proceeding anyway", err);
            // Decide if you want to block user or let them continue without tracking
        }

        // save to global context
        setSelectedProtocol(mappedProtocol);

        // --- 3) navigate to real participant interface
        navigate("/participant/interface", {
          replace: true,
          state: {
            protocol: mappedProtocol,
            testingMode: false,
            editingMode: false,
            participant: response.participant,
            token,
            sessionId
          }
        });

     } catch (e) {
        // --- ERROR HANDLING LOGIC ---
        let errorState = {};

        // 1. Check for "Inactive" error specifically
        if (e.message && e.message.includes("active")) { // "not active" or "is not active"
            errorState = {
                title: t("inactive.title"),
                message: t("inactive.message"),
                isWarning: true
            };
        } else if (e.message && e.message.includes("token")) { // "not active" or "is not active"
              errorState = {
                  title: t("invalidToken.title"),
                  message: t("invalidToken.message"),
                  isWarning: true
              };
        } else {
            // 2. Default/Network errors
            errorState = {
                title: t("error.title", "Unable to Load Protocol"),
                message: e.message || t("error.generic", "An unexpected error occurred."),
                isWarning: false
            };
        }

        // Navigate to the Error/404 page with the specific state
        navigate("/error", { 
            replace: true, 
            state: errorState 
        });
     }
    }

    load();
  }, [token, mappings, navigate, setSelectedProtocol]);

  return <div className="app-container"><p>{t("loading", "Loading...")}</p></div>;
}


// --- helper
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
