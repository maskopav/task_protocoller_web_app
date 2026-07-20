// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Recorder } from "./Recorder";
import TaskLayout from "../TaskLayout/TaskLayout";
import InfoTooltip from "../InfoToolTip/InfoToolTip";
import MediaPermissionContent from "./MediaPermissionContent";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext";
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
  MAX_SCREEN_REPEATS: 3, // # of times a failed screen shows before final behavior kicks in
  VAD_PRECISION_CONFIG: {
    redemptionMs: 50,            
    preSpeechPadMs: 100,          
    minSpeechMs: 100,             
    positiveSpeechThreshold: 0.50, 
    negativeSpeechThreshold: 0.35, 
  },
  MAX_WAIT_TIME_MS: 4000,
  COUNTING_FALLBACK_MS: 3500,
  MIN_COUNTING_MS: 2000,
  POST_SPEECH_SILENCE_MS: 3500, 
  DEBUG_MODE: import.meta.env.DEV,
};

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
  const silenceWindowRef   = useRef(null);  
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
          maxWaitTimeoutRef.current = null; 
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
    if (timeElapsed < CONFIG.MIN_COUNTING_MS) return;
    
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
export default function MicCheck({ onNext, onSaveAttempt, sessionId, token, onLogEvent, onPhaseChange, onPermissionPending, onRecordingStateChange }) {
  const { t } = useTranslation(["common"]);
  const confirm = useConfirm();
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
    onPhaseChange?.(phase, errorType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, errorType]);

  // Final-attempt behavior: once a failed screen has appeared MAX_SCREEN_REPEATS
  // times, muted → show an apology modal and stay put; noisy → auto-advance.
  // Guarded with a ref so it fires only once per outcome.
  useEffect(() => {
    if (phase !== 'noise-failed' || attempts < CONFIG.MAX_SCREEN_REPEATS) return;

    if (errorType === 'muted') {
      confirm({
        infoOnly: true,
        title: "",
        message: <Trans i18nKey="micCheck.mutedModalMessage" />,
        confirmText: t("buttons.ok"),
      });
    } else {
      if (onLogEvent) onLogEvent("mic_check_auto_advanced", { attempts });
      onNext({ skipped: true, attempts, reason: "noisy_background" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, errorType, attempts]);

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

  const handleLocalRecordingStateChange = (isRecording) => {
    handleRecordingStateChange(isRecording);           
    if (onRecordingStateChange) {
      onRecordingStateChange(isRecording);             
    }
  };

  const handleMicError = (err) => {
    logToServer("MicCheck Error:", { name: err.name, message: err.message });
    let type = ERR.GENERIC;

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
    let audioBlob;
    let safeAudioUrl;
    try {
      const response = await fetch(taskData.audioURL);
      audioBlob = await response.blob();
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

    const attemptData = {
      audioBlob: audioBlob, 
      snrScore: calculatedScore,
      duration: CONFIG.RECORDING_DURATION,
      speechSegments: taskData.speechSegments,
      timestamp: Date.now(),
      attemptNumber: attempts + 1
    };

    if (evaluatedError) {
      if (onSaveAttempt) onSaveAttempt(attemptData);
    } else {
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

  // ── RENDER PHASES ──────────────────────────────────────────────────
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
        onRecordingStateChange={handleLocalRecordingStateChange}
        onVadSpeechStart={handleVadSpeechStart}
        onVadSpeechEnd={handleVadSpeechEnd}
        vadConfigOverride={CONFIG.VAD_PRECISION_CONFIG}
        onError={handleMicError}
        onPermissionPending={onPermissionPending}
      />
    );
  }

  // Permission intro & hardware/permission warnings both render as a
  // MediaPermissionContent screen — it owns the TaskLayout wiring
  // internally now, so these phases just hand it text + callbacks.
  if (phase === 'intro') {
    return (
      <MediaPermissionContent
        type="microphone"
        variant="intro"
        title={<Trans i18nKey="micCheck.calibrationTitle" />}
        introText={
          <>
            <Trans i18nKey="micCheck.permissionWarning" />
            <br /><br />
            <Trans i18nKey="micCheck.permissionInstruction" />
          </>
        }
        btnText={<Trans i18nKey="micCheck.btnUnderstand" />}
        onBtnClick={() => {
          if (onLogEvent) onLogEvent("button_start");
          setPhase('noise');
        }}
      />
    );
  }

  if (phase === 'warning') {
    const config = {
      [ERR.DENIED]:  { title: 'titleDenied', desc: 'descDenied' },
      [ERR.MISSING]: { title: 'titleHardware', desc: 'descMissing' },
      [ERR.BUSY]:    { title: 'titleHardware', desc: 'descBusy' },
      [ERR.GENERIC]: { title: 'titleGeneric', desc: 'descGeneric' },
    }[errorType || ERR.GENERIC];

    return (
      <MediaPermissionContent
        type="microphone"
        variant="denied"
        title={t(`micCheck.guide.${config.title}`)}
        deniedText={t(`micCheck.guide.${config.desc}`)}
        showImage={errorType === ERR.DENIED}
        customSteps={(osTab) => (
          <Trans
            i18nKey={`common:micCheck.guide.steps.${osTab}.${errorType === ERR.DENIED ? 'systemAndBrowser' : 'hardware'}`}
            t={t}
          />
        )}
        btnText={t("micCheck.guide.btnRetry")}
        onBtnClick={() => setPhase('noise')}
      />
    );
  }

  const uiState = getUIStateContent(phase, noiseScore, errorType, onNext, () => setPhase('noise'), t, onLogEvent, finalMicData);
  if (!uiState) return null;

  // We only pass the instructions prop to TaskLayout if there is actual text to display
  const hasInstructions = Boolean(uiState.message || uiState.instructions);

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
        hasInstructions ? (
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
        ) : null
      }
      mainClassName="mic-check-main"
      controlsClassName="mic-check-controls"
      controls={
        <>
          <button className={`btn-primary ${phase === 'noise-failed' ? 'btn-repeat' : ''}`} onClick={uiState.onBtnClick}>
            {uiState.btnText}
          </button>
        </>
      }
    >
      {/* If the state requires a complex component (like the Intro phase), it renders here */}
      {uiState.mainComponent}
    </TaskLayout>
  );
}

// ==========================================
// 4. UTILITIES
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
        tooltip: <InfoTooltip title="" text={<Trans i18nKey="micCheck.mutedAdditionalInfo" />} />,
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