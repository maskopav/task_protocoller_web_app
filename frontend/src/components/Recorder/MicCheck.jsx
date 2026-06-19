// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Recorder } from "./Recorder";
import TaskLayout from "../TaskLayout/TaskLayout";
import InfoTooltip from "../InfoToolTip/InfoToolTip";
import warningIcon from "../../assets/generalIcons/warning-icon.svg";
import "./Recorder.css";
import "./MicCheck.css";
import { calculateSNR } from "../../utils/audioAnalysis";
import { logToServer } from "../../utils/frontendLogger";

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const CONFIG = {
  TARGET_SNR: 9,
  RECORDING_DURATION: 12,
  VAD_PRECISION_CONFIG: {
    redemptionMs: 50,            // Cut off silence quickly after a word ends
    preSpeechPadMs: 100,          
    minSpeechMs: 100,             // Catch very short spoken numbers like "two" or "four"
    positiveSpeechThreshold: 0.50, // Slightly stricter than 0.35 to ignore heavy breathing
    negativeSpeechThreshold: 0.35, 
  },
  MAX_WAIT_TIME_MS: 4000,
  COUNTING_FALLBACK_MS: 3500,
  MIN_COUNTING_MS: 2000,
  POST_SPEECH_SILENCE_MS: 3500, // How long after the last word ends before we call it "done counting"
  DEBUG_MODE: import.meta.env.DEV,
};

// Standardized error types to avoid "NotAllowedError" casing bugs
const ERR = {
  DENIED: 'PERMISSION_DENIED',
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

  const maxWaitTimeoutRef  = useRef(null);
  const fallbackTimeoutRef = useRef(null);
  const silenceWindowRef   = useRef(null);  // "did the last word just end?" timer
  const actualStartTimeRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(maxWaitTimeoutRef.current);
      clearTimeout(fallbackTimeoutRef.current);
      clearTimeout(silenceWindowRef.current);
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
        clearTimeout(silenceWindowRef.current);
        setForceTimerActive(false);
        maxWaitTimeoutRef.current = setTimeout(() => {
          maxWaitTimeoutRef.current = null; // Mark as fired so handleVadSpeechStart knows
          setForceTimerActive(true);
          actualStartTimeRef.current = Date.now();
          startFallbackTimer();
        }, CONFIG.MAX_WAIT_TIME_MS);
        return 'counting';
      } else if (!isRecording) {
        clearTimeout(maxWaitTimeoutRef.current);
        clearTimeout(fallbackTimeoutRef.current);
        clearTimeout(silenceWindowRef.current);
        return 'pre-start';
      }
      return currentPhase;
    });
  };

  const handleVadSpeechStart = () => {
    clearTimeout(silenceWindowRef.current);
    clearTimeout(fallbackTimeoutRef.current);
    startFallbackTimer();

    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null;
      actualStartTimeRef.current = Date.now();
    }
  };

  const handleVadSpeechEnd = () => {
    if (!actualStartTimeRef.current) return;
    const timeElapsed = Date.now() - actualStartTimeRef.current;
    // Don't arm the silence window until minimum time has elapsed since counting began.
    // This guards against a cough or throat-clear triggering silence early,
    // regardless of how many segments the VAD detected.
    if (timeElapsed < CONFIG.MIN_COUNTING_MS) return;
    // handleVadSpeechStart will cancel it if the participant keeps speaking.
    clearTimeout(silenceWindowRef.current);
    silenceWindowRef.current = setTimeout(() => {
      clearTimeout(fallbackTimeoutRef.current);
      setPromptPhase((phase) => phase === 'counting' ? 'silence' : phase);
    }, CONFIG.POST_SPEECH_SILENCE_MS);
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
export default function MicCheck({ onNext, onSaveAttempt, sessionId, token, onLogEvent }) {
  const { t } = useTranslation(["common"]);
  const [phase, setPhase] = useState('checking'); 
  const [noiseScore, setNoiseScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [errorType, setErrorType] = useState(null);
  const [finalMicData, setFinalMicData] = useState(null);

  const { 
    currentInstructions, forceTimerActive, handleRecordingStateChange, 
    handleVadSpeechStart, handleVadSpeechEnd 
  } = useMicCheckInstructions();

  useEffect(() => {
    async function checkMicPermission() {
      if (!navigator.permissions?.query) {
        setPhase('intro');
        return;
      }
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'denied') {
          logToServer("MicCheck Error: Permission explicitly denied by browser/OS on load, result:", result);
          setErrorType(ERR.DENIED);
          setPhase('warning');
        } else if (result.state === 'prompt') {
          setPhase('intro');
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
        logToServer("MicCheck Error: navigator.permissions.query failed", error);
        setPhase('intro');
      }
    }
    checkMicPermission();
  }, []);

  const handleMicError = (err) => {
    logToServer("MicCheck Error:", { name: err.name, message: err.message });
    let type = ERR.GENERIC;

    // Unify the denied errors because browsers can't reliably distinguish 
    // OS-level blocks from Browser-level blocks
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      type = ERR.DENIED;
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      type = ERR.MISSING;
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      type = ERR.BUSY;
    }

    setErrorType(type);
    setPhase('warning');
  };

  const handleNoiseCheckComplete = async (taskData) => {
    // Fetch the blob IMMEDIATELY before changing any state.
    let audioBlob;
    let safeAudioUrl;
    try {
      const response = await fetch(taskData.audioURL);
      audioBlob = await response.blob();
      // Create a fresh URL that WE control, so it doesn't get destroyed by the Recorder unmounting
      safeAudioUrl = URL.createObjectURL(audioBlob); 
    } catch (err) {
      logToServer("Failed to fetch audio blob for MicCheck", err);
    }

    setPhase('analyzing');
    const result = await calculateSNR(safeAudioUrl, taskData.speechSegments, taskData.recordingStartTime);
    const calculatedScore = result.snr ? result.snr.toFixed(1) : 0;

    let evaluatedError = result.error;
    if (!evaluatedError && result.snr < CONFIG.TARGET_SNR) {
        evaluatedError = "too-much-noise";
    }
    
    setNoiseScore(calculatedScore);
    setErrorType(evaluatedError);
    setAttempts(prev => prev + 1);

    // Bundle the data for this specific recording
    const attemptData = {
      audioBlob: audioBlob, 
      snrScore: calculatedScore,
      duration: CONFIG.RECORDING_DURATION,
      speechSegments: taskData.speechSegments,
      timestamp: Date.now()
    };

    // Split logic: Is it a failure or a success?
    if (evaluatedError) {
      // FAILED: Save it immediately using the new prop
      if (onSaveAttempt) onSaveAttempt(attemptData);
    } else {
      // SUCCESS: Save it to state so we can pass it when they click 'Proceed'
      setFinalMicData(attemptData);
    }

    if (safeAudioUrl) {
      URL.revokeObjectURL(safeAudioUrl);
    }

    const nextPhase = evaluatedError ? 'noise-failed' : 'noise-success';
    if (onLogEvent) {
       onLogEvent("mic_check_result", {
          snr_score: calculatedScore,
          error_type: evaluatedError || "none",
          passed: nextPhase === 'noise-success'
       });
    }
    setPhase(nextPhase);

    logToServer(`MicCheck completed. Phase result: ${nextPhase}. SNR: ${calculatedScore} dB`, {
      errorType: evaluatedError,
      debugData: result.debugData
    });
  };

  if (['checking', 'analyzing'].includes(phase)) {
    return (
      <TaskLayout 
        instructionsClassName="no-title pulse-animation"
        instructions={<h2>{t(`micCheck.${phase}`)}</h2>}
      />
    );
  }

  if (phase === 'noise') {
    return (
      <Recorder
        key="noise-phase"
        title={t("micCheck.noiseTitle")}
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
        vadConfigOverride={CONFIG.VAD_PRECISION_CONFIG}
        onError={handleMicError}
      />
    );
  }

  if (phase === 'warning') {
    return (
      <TaskLayout>
        <PermissionGuide errorType={errorType} onRetry={() => setPhase('noise')} />
      </TaskLayout>
    );
  }

  const uiState = getUIStateContent(phase, noiseScore, errorType, onNext, () => setPhase('noise'), t, onLogEvent, finalMicData);
  if (!uiState) return null;

  return (
    <TaskLayout 
      title={
        <>
          {uiState.isSuccess && <span className="check-icon-mask" />}
          {uiState.title}
        </>
      }
      showSpacer={true}
      instructions={
        <>
          {uiState.message && (
            <div className="mic-check-message-block">
              <span className={uiState.isSuccess ? "success-text-highlight" : "warning-text-highlight"}>
                {uiState.message}
              </span>
              {uiState.tooltip && (
                <div className="mic-check-info-wrapper">
                  {uiState.tooltip}
                </div>
              )}
            </div>
          )}
          {uiState.message && <><br /><br /></>}
          {uiState.instructions}
        </>
      }
      mainClassName="mic-check-main"
      controlsClassName="mic-check-controls"
      controls={
        <>
          <button className={`btn-primary ${phase === 'noise-failed' ? 'btn-repeat' : ''}`} onClick={uiState.onBtnClick}>
            {uiState.btnText}
          </button>
          {phase === 'noise-failed' && attempts >= 2 && (
              <button 
                className="btn-secondary" 
                onClick={() => {
                  if (onLogEvent) onLogEvent("button_skip_mic_check");
                  onNext({ skipped: true, attempts: attempts }); 
                }}
              >
                {t("micCheck.btnProceed")}
              </button>
          )}
        </>
      }
    />
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
    [ERR.DENIED]:  { title: 'titleDenied', desc: 'descDenied', icon: 'icon-lock' },
    [ERR.MISSING]: { title: 'titleHardware', desc: 'descMissing', icon: 'icon-hardware' },
    [ERR.BUSY]:    { title: 'titleHardware', desc: 'descBusy',    icon: 'icon-hardware' },
    [ERR.GENERIC]: { title: 'titleGeneric', desc: 'descGeneric', icon: 'icon-lock' },
  }[errorType || ERR.GENERIC];

  const showIllustration = errorType === 'BROWSER_DENIED';
  const illustrationRoot = `${import.meta.env.BASE_URL}assets/microphonePermission/`;
  const illustrationSrc = activeTab === 'android' ? `${illustrationRoot}android-browser-help.png` : `${illustrationRoot}ios-browser-help.png`;

  const getStepKey = () => {
    if (errorType === ERR.DENIED) return 'systemAndBrowser';
    return 'hardware'; // Fallback for missing/busy
  };

  const baseKey = `common:micCheck.guide.steps.${activeTab}.${getStepKey()}`;

  return (
    <div className="permission-guide-container">
      <div className="guide-card">
        <div className="guide-header">
          <h2>{t(`micCheck.guide.${config.title}`)}</h2>
          <p className="error-description">{t(`micCheck.guide.${config.desc}`)}</p>
        </div>

        <div className="tab-switcher">
          <button 
            className={`tab-btn ${activeTab === 'android' ? 'active' : ''}`} 
            onClick={() => setActiveTab('android')}
          >
            {t("micCheck.guide.tabAndroid")}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'ios' ? 'active' : ''}`} 
            onClick={() => setActiveTab('ios')}
          >
            {t("micCheck.guide.tabIos")}
          </button>
        </div>

        <div className="instruction-steps">
          <div className="solution-label">{t("micCheck.guide.howToFix")}</div>
          {showIllustration && (
            <div className="illustration-container">
              <img 
                src={illustrationSrc} 
                alt="Help illustration" 
                className="instruction-image" 
              />
            </div>
          )}
          <div className="steps-text-block">
            <Trans 
              i18nKey={baseKey} 
              t={t}
            />
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
function getUIStateContent(phase, noiseScore, errorType, onNext, onRetry, t, onLogEvent, finalMicData) {
  const common = { 
    onBtnClick: () => {
      if (onLogEvent) onLogEvent("button_repeat", { previous_error: errorType });
      onRetry();
    }, 
    isSuccess: false, 
    btnText: t("micCheck.btnTryAgain") 
  };
  
  switch (phase) {
    case 'intro': return {
      title: <Trans i18nKey="micCheck.calibrationTitle" />,
      message: null,
      instructions: (
        <>
          <Trans i18nKey="micCheck.permissionWarning" />
          <div className="intro-visual-container">
            <img src={`${import.meta.env.BASE_URL}assets/microphonePermission/popup-window.jpeg`} alt="Microphone access guide" className="intro-preview-img" />
          </div>
          <Trans i18nKey="micCheck.permissionInstruction" />
        </>
      ),
      btnText: <Trans i18nKey="micCheck.btnUnderstand" />, // The user clicks "I understand"
      onBtnClick: () => {
        if (onLogEvent) onLogEvent("button_start");
        onRetry();
      }, // onRetry triggers () => setPhase('noise'), which moves them to the next step!
      isSuccess: false
    };
    case 'noise-failed': {
      const WarningTitle = ({ children }) => (
        <div className="warning-title-container">
          <div 
            className="warning-icon-mask mic-check-warning-mask" 
            style={{ '--icon-url': `url("${warningIcon}")` }} 
          />
          <span>{children}</span>
        </div>
      );

      if (errorType === 'muted') return { 
        ...common, 
        title: <WarningTitle><Trans i18nKey="micCheck.mutedTitle" /></WarningTitle>, 
        message: <Trans i18nKey="micCheck.mutedMessage" />,
        tooltip: <InfoTooltip title="" text={<Trans i18nKey="micCheck.mutedInfo" />} />,
        instructions: <Trans i18nKey="micCheck.mutedInstructions" /> 
      };
      
      return { 
        ...common, 
        title: <WarningTitle><Trans i18nKey="micCheck.failedTitle" /></WarningTitle>, 
        message: <Trans i18nKey="micCheck.failedMessage" />,
        tooltip: <InfoTooltip title="" text={<Trans i18nKey="micCheck.failedAdditionalInfo" />} />,
        instructions: <Trans i18nKey="micCheck.failedInstructions" /> 
      };
    }
    case 'noise-success': return {
      title: <Trans i18nKey="micCheck.successTitle" />,
      message: <Trans i18nKey="micCheck.successMessage" />,
      tooltip: null,
      instructions: <Trans i18nKey="micCheck.successInstructions" />,
      btnText: <Trans i18nKey="micCheck.btnProceed" />,
      onBtnClick: () => {
        if (onLogEvent) onLogEvent("button_proceed");
        onNext(finalMicData); 
      },
      isSuccess: true
    };
    default: return null;
  }
}