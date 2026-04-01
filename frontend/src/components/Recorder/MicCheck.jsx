// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Recorder } from "./Recorder";
import "./Recorder.css";

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const CONFIG = {
  TARGET_SNR: 8,
  RECORDING_DURATION: 12,
  VAD_REDEMPTION_MS: 1500,
  MAX_WAIT_TIME_MS: 4000,
  COUNTING_FALLBACK_MS: 5000,
  MIN_COUNTING_MS: 2000,
  DEBUG_MODE: false,
};

// Standardized error types to avoid "NotAllowedError" casing bugs
const ERR = {
  BROWSER: 'BROWSER_DENIED',
  SYSTEM: 'SYSTEM_DENIED',
  MISSING: 'HARDWARE_MISSING',
  BUSY: 'HARDWARE_IN_USE',
  GENERIC: 'GENERIC'
};

// ==========================================
// 2. CUSTOM HOOK
// ==========================================
function useMicCheckInstructions() {
  const [promptPhase, setPromptPhase] = useState('pre-start');
  const [forceTimerActive, setForceTimerActive] = useState(false);

  const maxWaitTimeoutRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);
  const actualStartTimeRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(maxWaitTimeoutRef.current);
      clearTimeout(fallbackTimeoutRef.current);
    };
  }, []);

  const startFallbackTimer = () => {
    fallbackTimeoutRef.current = setTimeout(() => {
      setPromptPhase((phase) => phase === 'counting' ? 'silence' : phase);
    }, CONFIG.COUNTING_FALLBACK_MS);
  };

  const handleRecordingStateChange = (isRecording) => {
    setPromptPhase((currentPhase) => {
      if (isRecording && currentPhase === 'pre-start') {
        setForceTimerActive(false); 
        maxWaitTimeoutRef.current = setTimeout(() => {
          setForceTimerActive(true);
          actualStartTimeRef.current = Date.now();
          startFallbackTimer();
        }, CONFIG.MAX_WAIT_TIME_MS);
        return 'counting'; 
      } else if (!isRecording) {
        clearTimeout(maxWaitTimeoutRef.current);
        clearTimeout(fallbackTimeoutRef.current);
        return 'pre-start';
      }
      return currentPhase;
    });
  };

  const handleVadSpeechStart = () => {
    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null;
      actualStartTimeRef.current = Date.now();
      startFallbackTimer();
    }
  };

  const handleVadSpeechEnd = () => {
    if (!actualStartTimeRef.current) return;
    const timeElapsed = Date.now() - actualStartTimeRef.current;
    if (timeElapsed < CONFIG.MIN_COUNTING_MS) return; 
    clearTimeout(fallbackTimeoutRef.current);
    setPromptPhase((phase) => phase === 'counting' ? 'silence' : phase);
  };

  const getInstructionsText = () => {
    switch(promptPhase) {
      case 'pre-start': return <Trans i18nKey="micCheck.noiseInstructions" />;
      case 'counting': return <Trans i18nKey="micCheck.noiseInstructionsCounting" />;
      case 'silence': return <Trans i18nKey="micCheck.noiseInstructionsSilence" />;
      default: return "";
    }
  };

  return { 
    currentInstructions: getInstructionsText(), 
    forceTimerActive,
    handleRecordingStateChange, 
    handleVadSpeechStart,
    handleVadSpeechEnd
  };
}

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
export default function MicCheck({ onNext }) {
  const { t } = useTranslation(["common"]);
  const [phase, setPhase] = useState('checking'); 
  const [noiseScore, setNoiseScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [debugOutput, setDebugOutput] = useState(null); 
  const [errorType, setErrorType] = useState(null);

  const { 
    currentInstructions, forceTimerActive, handleRecordingStateChange, 
    handleVadSpeechStart, handleVadSpeechEnd 
  } = useMicCheckInstructions();

  useEffect(() => {
    async function checkMicPermission() {
      if (!navigator.permissions?.query) {
        setPhase('noise');
        return;
      }
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'denied') {
          setErrorType(ERR.BROWSER);
          setPhase('warning');
        } else {
          setPhase('noise');
        }
        result.onchange = () => {
          if (result.state === 'granted') {
            setErrorType(null);
            setPhase('noise');
          }
        };
      } catch (error) {
        setPhase('noise');
      }
    }
    checkMicPermission();
  }, []);

  const handleMicError = (err) => {
    console.error("MicCheck Error:", err.name, err.message);
    const message = (err.message || '').toLowerCase();
    let type = ERR.GENERIC;

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      type = message.includes('system') ? ERR.SYSTEM : ERR.BROWSER;
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      type = ERR.MISSING;
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      type = ERR.BUSY;
    }

    setErrorType(type);
    setPhase('warning');
  };

  const handleNoiseCheckComplete = async (taskData) => {
    setPhase('analyzing');
    const result = await calculateSNR(taskData.audioURL, taskData.speechSegments, taskData.recordingStartTime);
    setNoiseScore(result.snr ? result.snr.toFixed(1) : 0);
    setDebugOutput(result.debugData);
    setErrorType(result.error);
    setAttempts(prev => prev + 1);

    setPhase(result.error === 'no-speech' || result.snr < CONFIG.TARGET_SNR ? 'noise-failed' : 'noise-success');
  };

  if (['checking', 'analyzing'].includes(phase)) {
    return (
      <div className="task-container">
        <div className="task-header">
          <div className="active-instructions pulse-animation">
            <h2>{t(`micCheck.${phase}`)}</h2>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'noise') {
    return (
      <Recorder
        key="noise-phase"
        title={t("micCheck.calibrationTitle")}
        instructions={currentInstructions}
        mode="countDown"
        duration={CONFIG.RECORDING_DURATION}
        autoPermission={true}
        useVAD={true}
        showNextButton={false}
        autoSubmit={true}
        onNextTask={handleNoiseCheckComplete} 
        showMicIcon={true}
        suppressSilenceWarning={true} 
        disableTimerFreeze={true}
        forceTimerActive={forceTimerActive}
        onRecordingStateChange={handleRecordingStateChange}
        onVadSpeechStart={handleVadSpeechStart}
        onVadSpeechEnd={handleVadSpeechEnd}
        vadConfigOverride={{ redemptionMs: CONFIG.VAD_REDEMPTION_MS }}
        onError={handleMicError}
      />
    );
  }

  if (phase === 'warning') {
    return (
      <div className="task-container">
        <PermissionGuide errorType={errorType} onRetry={() => setPhase('noise')} />
      </div>
    );
  }

  const uiState = getUIStateContent(phase, noiseScore, errorType, onNext, () => setPhase('noise'), t);
  if (!uiState) return null;

  return (
    <div className="task-container">
      <div className="task-header">
        <h1>
          {uiState.isSuccess && <span className="check-icon-mask" />}
          {uiState.title}
        </h1>
        <div className="active-instructions">
          {uiState.message && (
            <span className={uiState.isSuccess ? "success-text-highlight" : "warning-text-highlight"}>
              {uiState.message}
            </span>
          )}
          {uiState.message && <><br /><br /></>}
          {uiState.instructions}
        </div>
      </div>
      <div className="recording-area" style={{ minHeight: 0 }}></div>
      <div className="bottom-controls" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button className={`btn-primary ${phase === 'noise-failed' ? 'btn-repeat' : ''}`} onClick={uiState.onBtnClick}>
          {uiState.btnText}
        </button>
        {phase === 'noise-failed' && attempts >= 2 && (
            <button className="btn-secondary" onClick={onNext}>
              {t("micCheck.btnProceed")}
            </button>
        )}
      </div>
      {CONFIG.DEBUG_MODE && debugOutput && <DebugPanel debugOutput={debugOutput} noiseScore={noiseScore} />}
    </div>
  );
}

// ==========================================
// 4. SUB-COMPONENTS
// ==========================================
function PermissionGuide({ onRetry, errorType }) {
  const { t } = useTranslation(["common"]);
  const [activeTab, setActiveTab] = useState(() => 
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android'
  );

  // Map errors to specific translation keys and icons
  const config = {
    [ERR.BROWSER]: { title: 'titleBrowser', desc: 'descBrowser', icon: 'icon-lock' },
    [ERR.SYSTEM]:  { title: 'titleSystem',  desc: 'descSystem',  icon: 'icon-lock' },
    [ERR.MISSING]: { title: 'titleHardware', desc: 'descMissing', icon: 'icon-hardware' },
    [ERR.BUSY]:    { title: 'titleHardware', desc: 'descBusy',    icon: 'icon-hardware' },
    [ERR.GENERIC]: { title: 'titleBrowser', desc: 'descGeneric', icon: 'icon-lock' },
  }[errorType || ERR.GENERIC];

  const getStepKey = () => {
    if (errorType === ERR.BROWSER) return 'browser';
    if (errorType === ERR.SYSTEM) return 'system';
    return 'hardware'; // Fallback for missing/busy
  };

  return (
    <div className="permission-guide-container">
      <div className="guide-card">
        <div className="guide-header">
          <div className={`status-icon ${config.icon}`}></div>
          <h2>{t(`micCheck.guide.${config.title}`)}</h2>
          <p className="error-description">{t(`micCheck.guide.${config.desc}`)}</p>
        </div>

        <div className="tab-switcher">
          <button className={activeTab === 'android' ? 'active' : ''} onClick={() => setActiveTab('android')}>
            {t("micCheck.guide.tabAndroid")}
          </button>
          <button className={activeTab === 'ios' ? 'active' : ''} onClick={() => setActiveTab('ios')}>
            {t("micCheck.guide.tabIos")}
          </button>
        </div>

        <div className="instruction-steps">
          <div className="breadcrumb-step">
            <strong>{t("micCheck.guide.howToFix")}:</strong><br />
            {t(`micCheck.guide.steps.${activeTab}.${getStepKey()}`)}
          </div>
        </div>

        <button className="btn-primary full-width" onClick={onRetry}>
          {t("micCheck.guide.btnRetry")}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 5. UTILITIES
// ==========================================
function getUIStateContent(phase, noiseScore, errorType, onNext, onRetry, t) {
  const common = { onBtnClick: onRetry, isSuccess: false, btnText: t("micCheck.btnTryAgain") };
  
  switch (phase) {
    case 'noise-failed': 
      if (errorType === 'muted') return { 
        ...common, 
        title: t("micCheck.mutedTitle"), 
        message: t("micCheck.mutedMessage"), 
        instructions: t("micCheck.mutedInstructions") 
      };
      if (errorType === 'no-speech') return { 
        ...common, 
        title: t("micCheck.noSpeechTitle"), 
        message: t("micCheck.noSpeechMessage"), 
        instructions: t("micCheck.noSpeechInstructions") 
      };
      return { 
        ...common, 
        title: t("micCheck.failedTitle"), 
        message: t("micCheck.failedMessage"), 
        instructions: t("micCheck.failedInstructions") 
      };
    case 'noise-success': return {
      title: t("micCheck.successTitle"),
      message: t("micCheck.successMessage"),
      instructions: t("micCheck.successInstructions"),
      btnText: t("micCheck.btnProceed"),
      onBtnClick: onNext,
      isSuccess: true
    };
    default: return null;
  }
}