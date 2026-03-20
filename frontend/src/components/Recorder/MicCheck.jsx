// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Recorder } from "./Recorder";
import "./Recorder.css";

// Helper function to analyze the volume of the recorded blob
async function analyzeNoiseLevel(audioUrl) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Get the raw audio data from the first channel
    const channelData = audioBuffer.getChannelData(0); 

    // Calculate RMS (Root Mean Square) to find average volume
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);
    
    // Convert to Decibels (dB). 
    // This usually ranges from -100 (total silence) to 0 (loudest possible).
    const decibels = 20 * Math.log10(rms); 
    
    return decibels;
  } catch (error) {
    console.error("Error analyzing audio:", error);
    return -100; // Assume quiet if error occurs so we don't block the user forever
  }
}

export default function MicCheck({ onNext }) {
  const { t } = useTranslation(["common"]);
  const [phase, setPhase] = useState('checking');
  const [noiseScore, setNoiseScore] = useState(0);

  const NOISE_THRESHOLD = -40; 

  // Silently check permission on mount ---
  useEffect(() => {
    async function checkMicPermission() {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') {
          setPhase('noise'); // Skip warning!
        } else {
          setPhase('warning'); // Show warning (they need to be prompted)
        }
      } catch (error) {
        // Fallback: If browser (like older Safari) doesn't support querying 'microphone'
        setPhase('warning');
      }
    }

    if (navigator.permissions && navigator.permissions.query) {
      checkMicPermission();
    } else {
      setPhase('warning');
    }
  }, []);

  const handleNoiseCheckComplete = async (taskData) => {
    setPhase('analyzing');
    const dB = await analyzeNoiseLevel(taskData.audioURL);
    setNoiseScore(dB.toFixed(1));

    if (dB > NOISE_THRESHOLD) {
      setPhase('noise-failed');
    } else {
      setPhase('speech');
    }
  };

  // PHASE -1: Checking Permission (Blank/Loading state for a few milliseconds)
  if (phase === 'checking') {
    return (
      <div className="task-container">
        <div className="task-header">
          <div className="active-instructions pulse-animation">
            <h2>{t("micCheck.loading", "Loading...")}</h2>
          </div>
        </div>
      </div>
    );
  }

  // PHASE 0: Warning / Permission Screen
  if (phase === 'warning') {
    return (
      <div className="task-container">
        <div className="task-header">
          <h1>{t("micCheck.setupTitle", "Microphone Setup & Calibration")}</h1>
          <div className="active-instructions">
            {t("micCheck.permissionWarning", "In the next step, the browser will ask for permission to use your microphone.")}
            <br /><br />
            {t("micCheck.permissionInstruction", 'Please click "Allow" in the popup window so we can calibrate your audio.')}
          </div>
        </div>
        <div className="bottom-controls" style={{ marginTop: "auto" }}>
          <button className="btn-primary" onClick={() => setPhase('noise')}>
            {t("micCheck.btnUnderstand", "Understand & Continue")}
          </button>
        </div>
      </div>
    );
  }

  // PHASE 1: Background Noise Check (5-second countdown)
  if (phase === 'noise') {
    return (
      <Recorder
        key="noise-phase"
        title={t("micCheck.noiseTitle", "Background Noise Check")}
        instructions={t("micCheck.noiseInstructions", "Please remain completely silent. Click Start and wait for the 5-second countdown to finish so we can measure the room's background noise.")}
        mode="countDown"
        duration={5}
        autoPermission={true}
        useVAD={false}
        showNextButton={true}
        onNextTask={handleNoiseCheckComplete} 
      />
    );
  }

  // PHASE 1.5: Loading State
  if (phase === 'analyzing') {
    return (
      <div className="task-container">
        <div className="task-header">
          <div className="active-instructions pulse-animation">
            <h2>{t("micCheck.analyzing", "Analyzing background noise... ⏱️")}</h2>
          </div>
        </div>
      </div>
    );
  }

  // PHASE 1.5b: Failed Noise Check
  if (phase === 'noise-failed') {
    return (
      <div className="task-container">
        <div className="task-header">
          <h1>{t("micCheck.failedTitle", "⚠️ Too Noisy")}</h1>
          <div className="active-instructions">
            <span className="warning-text-highlight">
              {t("micCheck.failedMessage", { score: noiseScore, defaultValue: `We detected too much background noise (${noiseScore} dB).` })}
            </span>
            <br /><br />
            {t("micCheck.failedInstructions", "For accurate results, you need to be in a quiet environment. Please close any open windows, turn off noisy appliances (like fans or AC), or move to a quieter room.")}
          </div>
        </div>
        <div className="bottom-controls" style={{ marginTop: "auto" }}>
          <button className="btn-primary" onClick={() => setPhase('noise')}>
            {t("micCheck.btnTryAgain", "Try Again")}
          </button>
        </div>
      </div>
    );
  }

  // PHASE 2: Speech Calibration (Counting 1 to 5)
  if (phase === 'speech') {
    return (
      <Recorder
        key="speech-phase" 
        title={t("micCheck.speechTitle", "Microphone Test")}
        instructions={t("micCheck.speechInstructions", "Your environment is perfectly quiet! Now, please count out loud from 1 to 5 at your normal speaking volume. Stop the recording, listen to the playback, and click Next if it sounds clear.")}
        mode="basicStop"
        autoPermission={true} 
        useVAD={false}
        showNextButton={true}
        onNextTask={onNext} 
      />
    );
  }

  return null;
}