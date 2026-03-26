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
    
    const channelData = audioBuffer.getChannelData(0); 

    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);
    const decibels = 20 * Math.log10(rms); 
    
    return decibels;
  } catch (error) {
    console.error("Error analyzing audio:", error);
    return -100;
  }
}

export default function MicCheck({ onNext }) {
  const { t } = useTranslation(["common"]);
  const [phase, setPhase] = useState('checking');
  const [noiseScore, setNoiseScore] = useState(0);
  const [attempts, setAttempts] = useState(0); // Track attempts

  const NOISE_THRESHOLD = -40; // Anything above this is too noisy for testing
  
  // Silently check permission on mount
  useEffect(() => {
    async function checkMicPermission() {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') {
          setPhase('noise');
        } else {
          setPhase('warning');
        }
      } catch (error) {
        setPhase('warning');
      }
    }

    if (navigator.permissions && navigator.permissions.query) {
      checkMicPermission();
    } else {
      setPhase('warning');
    }
  }, []);

  // Handler for Noise Phase
  const handleNoiseCheckComplete = async (taskData) => {
    setPhase('analyzing');
    const dB = await analyzeAudioLevel(taskData.audioURL);
    setNoiseScore(dB.toFixed(1));

    const currentAttempts = attempts + 1;
    setAttempts(currentAttempts);

    if (dB > NOISE_THRESHOLD) {
      setPhase('noise-failed');
    } else {
      setPhase('noise-success');
    }
  };

  // 1. Loading States
  if (['checking', 'analyzing'].includes(phase)) {
    const loadingText = phase === 'checking' 
      ? <Trans i18nKey="micCheck.loading" /> 
      : <Trans i18nKey="micCheck.analyzing" />;

    return (
      <div className="task-container">
        <div className="task-header">
          <div className="active-instructions pulse-animation">
            <h2>{loadingText}</h2>
          </div>
        </div>
        <div className="recording-area" style={{ minHeight: 0 }}></div>
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
        showMicIcon={false}
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
    
    case 'noise-success':
      title = <Trans i18nKey="micCheck.successTitle"></Trans>;
      message = <Trans i18nKey="micCheck.successMessage"></Trans>;
      instructions = <Trans i18nKey="micCheck.successInstructions"></Trans>;
      btnText = <Trans i18nKey="micCheck.btnProceed"></Trans>;
      onBtnClick = onNext; 
      isSuccessState = true;
      break;

    default:
      return null;
  }

  return (
    <div className="task-container">
      <div className="task-header">
        <h1>
          {isSuccessState && <span className="check-icon-mask" />}
            {title}
        </h1>
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
      <div className="recording-area" style={{ minHeight: 0 }}></div>
      <div className="bottom-controls" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button 
          className={`btn-primary ${phase === 'noise-failed' ? 'btn-repeat' : ''}`} 
          onClick={onBtnClick}
        >
          {btnText}
        </button>
        {/* Render 'Next' button if they've failed 2 or more times */}
        {phase === 'noise-failed' && attempts >= 2 && (
            <button className="btn-secondary" onClick={onNext}>
              <Trans i18nKey="micCheck.btnProceed" />
            </button>
        )}
      </div>
    </div>
  );
}