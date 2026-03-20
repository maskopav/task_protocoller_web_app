// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Recorder } from "./Recorder";
import "./Recorder.css";

// Helper function to analyze the volume of the recorded blob
async function analyzeAudioLevel(audioUrl) {
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
  const [speechScore, setSpeechScore] = useState(0);

  const NOISE_THRESHOLD = -40; // Anything above this is too noisy for testing
  const SPEECH_QUIET_THRESHOLD = -42; // Anything below this is a whisper or mic is too far
  const SPEECH_LOUD_THRESHOLD = -15;  // Anything above this is extremely loud and might distort
  
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

  // Handler for Phase 1: Noise
  const handleNoiseCheckComplete = async (taskData) => {
    setPhase('analyzing');
    const dB = await analyzeAudioLevel(taskData.audioURL);
    setNoiseScore(dB.toFixed(1));

    if (dB > NOISE_THRESHOLD) {
      setPhase('noise-failed');
    } else {
      setPhase('speech');
    }
  };

  // Handler for Phase 2: Speech
  const handleSpeechCheckComplete = async (taskData) => {
    setPhase('analyzing-speech');
    const dB = await analyzeAudioLevel(taskData.audioURL);
    setSpeechScore(dB.toFixed(1));

    if (dB < SPEECH_QUIET_THRESHOLD) {
      setPhase('speech-quiet');
    } else if (dB > SPEECH_LOUD_THRESHOLD) {
      setPhase('speech-loud');
    } else {
      setPhase('speech-success');
    }
  };

  // 1. Unified Loading States
  if (['checking', 'analyzing', 'analyzing-speech'].includes(phase)) {
    const loadingText = phase === 'checking' 
      ? <Trans i18nKey="micCheck.loading" /> 
      : phase === 'analyzing' 
        ? <Trans i18nKey="micCheck.analyzing" /> 
        : <Trans i18nKey="micCheck.analyzingSpeech" />;

    return (
      <div className="task-container">
        <div className="task-header">
          <div className="active-instructions pulse-animation">
            <h2>{loadingText}</h2>
          </div>
        </div>
        <div className="recording-area"></div>
        <div className="bottom-controls"></div>
      </div>
    );
  }

  // 2. The Native Recorder Component States
  if (phase === 'noise') {
    return (
      <Recorder
        key="noise-phase"
        title={<Trans i18nKey="micCheck.noiseTitle" />}
        instructions={<Trans i18nKey="micCheck.noiseInstructions" />}
        mode="countDown"
        duration={5}
        autoPermission={true}
        useVAD={false}
        showNextButton={true}
        onNextTask={handleNoiseCheckComplete} 
      />
    );
  }

  if (phase === 'speech') {
    return (
      <Recorder
        key="speech-phase" 
        title={<Trans i18nKey="micCheck.speechTitle" />}
        instructions={<Trans i18nKey="micCheck.speechInstructions" />}
        mode="basicStop"
        autoPermission={true} 
        useVAD={false}
        showNextButton={true}
        onNextTask={handleSpeechCheckComplete}
      />
    );
  }

  let title, message, instructions, btnText, onBtnClick;
  let isSuccessState = false;

  switch (phase) {
    case 'warning':
      title = <Trans i18nKey="micCheck.setupTitle" />;
      instructions = (
        <>
          {<Trans i18nKey="micCheck.permissionWarning" />}
          <br /><br />
          {<Trans i18nKey="micCheck.permissionInstruction" />}
        </>
      );
      btnText = <Trans i18nKey="micCheck.btnUnderstand" />;
      onBtnClick = () => setPhase('noise');
      break;

    case 'noise-failed':
      title = <Trans i18nKey="micCheck.failedTitle" />;
      message = <Trans i18nKey="micCheck.failedMessage" values={{ score: noiseScore }} />;
      instructions = <Trans i18nKey="micCheck.failedInstructions" />;
      btnText = <Trans i18nKey="micCheck.btnTryAgain" />;
      onBtnClick = () => setPhase('noise');
      break;

    case 'speech-quiet':
      title = <Trans i18nKey="micCheck.speechQuietTitle" />;
      message = <Trans i18nKey="micCheck.speechQuietMessage" values={{ score: speechScore }} />;
      instructions = <Trans i18nKey="micCheck.speechQuietInstructions" />;
      btnText = <Trans i18nKey="micCheck.btnTryAgain" />;
      onBtnClick = () => setPhase('speech');
      break;

    case 'speech-loud':
      title = <Trans i18nKey="micCheck.speechLoudTitle" /> ;
      message = <Trans i18nKey="micCheck.speechLoudMessage" values={{ score: speechScore }} />;
      instructions = <Trans i18nKey="micCheck.speechLoudInstructions" />;
      btnText = <Trans i18nKey="micCheck.btnTryAgain" />;
      onBtnClick = () => setPhase('speech');
      break;

    case 'speech-success':
      title = <Trans i18nKey="micCheck.speechSuccessTitle" />;
      message = <Trans i18nKey="micCheck.speechSuccessMessage" values={{ score: speechScore }} />;
      instructions = <Trans i18nKey="micCheck.speechSuccessInstructions" />;
      btnText = <Trans i18nKey="micCheck.btnProceed" />;
      onBtnClick = onNext;
      isSuccessState = true;
      break;
      
    default:
      return null;
  }

  return (
    <div className="task-container">
      <div className="task-header">
        <h1>{title}</h1>
        <div className="active-instructions">
          {message && (
            <span className={isSuccessState ? "success-text-highlight" : "warning-text-highlight"}>
              {message}
            </span>
          )}
          {message && <><br /><br /></>}
          {instructions}
        </div>
      </div>
      {/* Empty area dynamically absorbs remaining space, pushing the button nicely to the bottom */}
      <div className="recording-area"></div>
      <div className="bottom-controls">
        <button className="btn-primary" onClick={onBtnClick}>
          {btnText}
        </button>
      </div>
    </div>
  );
}