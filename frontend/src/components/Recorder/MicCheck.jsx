// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Recorder } from "./Recorder";
import "./Recorder.css";
import androidBrowserImg from "../../assets/android-browser-help.png";
import iosBrowserImg from "../../assets/ios-browser-help.png";

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const CONFIG = {
  TARGET_SNR: 7,
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
        setPhase('intro');
        return;
      }
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'denied') {
          setErrorType(ERR.BROWSER);
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
        setPhase('intro');
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

  const showIllustration = errorType === 'BROWSER_DENIED';
  const illustrationSrc = activeTab === 'android' ? androidBrowserImg : iosBrowserImg;

  const getStepKey = () => {
    if (errorType === ERR.BROWSER) return 'browser';
    if (errorType === ERR.SYSTEM) return 'system';
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
function getUIStateContent(phase, noiseScore, errorType, onNext, onRetry, t) {
  const common = { onBtnClick: onRetry, isSuccess: false, btnText: t("micCheck.btnTryAgain") };
  
  switch (phase) {
    case 'intro': return {
      title: <Trans i18nKey="micCheck.calibrationTitle" />,
      message: null,
      instructions: (
        <>
          <Trans i18nKey="micCheck.permissionWarning" />
          <br /><br />
          <Trans i18nKey="micCheck.permissionInstruction" />
        </>
      ),
      btnText: <Trans i18nKey="micCheck.btnUnderstand" />, // The user clicks "I understand"
      onBtnClick: onRetry, // onRetry triggers () => setPhase('noise'), which moves them to the next step!
      isSuccess: false
    };
    case 'noise-failed': 
      if (errorType === 'muted') return { 
        ...common, 
        title: t("micCheck.mutedTitle"), 
        message: t("micCheck.mutedMessage"), 
        instructions: t("micCheck.mutedInstructions") 
      };
      if (errorType === 'no-speech') return { 
        ...common, 
        title: <Trans i18nKey="micCheck.noSpeechTitle" />, 
        message: <Trans i18nKey="micCheck.noSpeechMessage" />, 
        instructions: <Trans i18nKey="micCheck.noSpeechInstructions" /> 
      };
      return { 
        ...common, 
        title: <Trans i18nKey="micCheck.failedTitle" />, 
        message: <Trans i18nKey="micCheck.failedMessage" />, 
        instructions: <Trans i18nKey="micCheck.failedInstructions" /> 
      };
    case 'noise-success': return {
      title: <Trans i18nKey="micCheck.successTitle" />,
      message: <Trans i18nKey="micCheck.successMessage" />,
      instructions: <Trans i18nKey="micCheck.successInstructions" />,
      btnText: <Trans i18nKey="micCheck.btnProceed" />,
      onBtnClick: onNext,
      isSuccess: true
    };
    default: return null;
  }
}

// Extracted Debug UI
const DebugPanel = ({ debugOutput, noiseScore }) => (
  <div style={{ marginTop: '2rem', padding: '1rem', background: '#1e1e1e', color: '#00ff00', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace', textAlign: 'left', overflowX: 'auto' }}>
      <h4 style={{ margin: '0 0 10px 0', color: '#fff' }}>🛠️ Math Debug Output</h4>
      <div><strong>Calculated SNR:</strong> {noiseScore} dB</div>
      <div><strong>Target Required:</strong> {CONFIG.TARGET_SNR} dB</div>
      <hr style={{ borderColor: '#333', margin: '10px 0' }}/>
      <div><strong>Total Audio Duration:</strong> {debugOutput.totalDurationSec?.toFixed(2)}s</div>
      <div><strong>VAD Speech Segments:</strong> {debugOutput.speechSegmentsExtracted}</div>
      <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
        {debugOutput.speechIndices.map((seg, i) => (
          <li key={i}>Segment {i+1}: {seg.startSec}s ➔ {seg.endSec}s</li>
        ))}
      </ul>
      <hr style={{ borderColor: '#333', margin: '10px 0' }}/>
      <div><strong>Signal (Voice) RMS:</strong> {debugOutput.signalRms?.toExponential(3)}</div>
      <div><strong>Noise (Silence) RMS:</strong> {debugOutput.noiseRms?.toExponential(3)}</div>
      <div style={{ color: '#888', marginTop: '5px' }}>
          *If Signal RMS is less than e-2, voice is very quiet.<br/>
          *If Noise RMS is higher than e-3, background is very noisy.
      </div>
  </div>
);

// Helper function to analyze real SNR using VAD segments
// Helper function to analyze real SNR using VAD segments
async function calculateSNR(audioUrl, speechSegments, recordingStartTime) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    // NEW FAILSAFE 1: If the file is basically empty (just headers), the mic gave no data.
    if (arrayBuffer.byteLength < 500) {
       console.log("Audio file is empty. Likely hardware mute or OS-level block.");
       return { snr: 0, error: 'muted', debugData: { byteLength: arrayBuffer.byteLength } };
    }

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // DEAD MIC / HARDWARE MUTE CHECK ---
    let maxAmplitude = 0;
    for (let i = 0; i < channelData.length; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > maxAmplitude) maxAmplitude = absValue;
    }
    
    // FAILSAFE 2: If it recorded a file, but the loudest sound is pure digital zeroes
    if (maxAmplitude < 0.001) {
       console.log("Audio is completely silent (Max Amplitude:", maxAmplitude, ")");
       return { snr: 0, error: 'muted', debugData: { maxAmplitude } };
    }

    const debugData = {
        sampleRate,
        totalDurationSec: channelData.length / sampleRate,
        maxAmplitude,
        speechSegmentsExtracted: speechSegments.length,
        signalSum: 0, signalCount: 0, noiseSum: 0, noiseCount: 0,
        signalRms: 0, noiseRms: 0,
        speechIndices: []
    };

    if (!speechSegments || speechSegments.length === 0) {
      console.log("No speech segments detected by VAD. Cannot calculate SNR.");
      return { snr: 0, error: 'no-speech', debugData };
    }

    const speechIndices = speechSegments.map(seg => {
      const startMs = Math.max(0, seg.startTime - recordingStartTime);
      const endMs = Math.max(0, seg.endTime - recordingStartTime);
      return {
        startIdx: Math.floor((startMs / 1000) * sampleRate),
        endIdx: Math.floor((endMs / 1000) * sampleRate),
        startSec: (startMs / 1000).toFixed(2),
        endSec: (endMs / 1000).toFixed(2)
      };
    });
    
    debugData.speechIndices = speechIndices;

    let signalSum = 0; let signalCount = 0;
    let noiseSum = 0; let noiseCount = 0;

    for (let i = 0; i < channelData.length; i++) {
      const isSpeech = speechIndices.some(range => i >= range.startIdx && i <= range.endIdx);
      const power = channelData[i] * channelData[i];

      if (isSpeech) {
        signalSum += power;
        signalCount++;
      } else {
        noiseSum += power;
        noiseCount++;
      }
    }

    debugData.signalSum = signalSum;
    debugData.signalCount = signalCount;
    debugData.noiseSum = noiseSum;
    debugData.noiseCount = noiseCount;

    if (noiseCount === 0 || noiseSum === 0) return { snr: 100, error: 'no-noise', debugData }; 
    if (signalCount === 0) return { snr: 0, error: 'no-speech', debugData };

    const signalRms = Math.sqrt(signalSum / signalCount);
    const noiseRms = Math.sqrt(noiseSum / noiseCount);
    
    debugData.signalRms = signalRms;
    debugData.noiseRms = noiseRms;

    const snrDb = 20 * Math.log10(signalRms / noiseRms);
    return { snr: snrDb, error: null, debugData };

  } catch (error) {
    console.error("Error analyzing audio SNR:", error);
    
    // NEW FAILSAFE 3: If decodeAudioData crashes entirely, treat it as a dead mic
    if (error.name === 'EncodingError' || String(error).includes('decode')) {
       console.log("Decoding failed - audio stream was likely empty due to hardware mute.");
       return { snr: 0, error: 'muted', debugData: null };
    }
    
    return { snr: 0, error: 'processing-error', debugData: null };
  }
}