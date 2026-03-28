// src/components/Recorder/MicCheck.jsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Recorder } from "./Recorder";
import "./Recorder.css";

// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
TARGET_SNR: 8,
  RECORDING_DURATION: 12,
  VAD_REDEMPTION_MS: 1500,
  
  MAX_WAIT_TIME_MS: 4000,       // Max time to wait for the user to make a sound before forcing the timer to start
  COUNTING_FALLBACK_MS: 5000,   // If VAD fails to detect the *end* of speech, switch to silence after this long
  MIN_COUNTING_MS: 2000,        // Ignore VAD "end of speech" triggers if they happen too quickly (e.g. a cough)
  
  DEBUG_MODE: false,
};

// ==========================================
// 2. CUSTOM HOOK (Manages Instructions & Timers)
// ==========================================
function useMicCheckInstructions() {
  const [promptPhase, setPromptPhase] = useState('pre-start');
  const [forceTimerActive, setForceTimerActive] = useState(false);

  const maxWaitTimeoutRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);
  const actualStartTimeRef = useRef(null);

  // Cleanup timers on unmount
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

        // FAILSAFE 1: Give them a few seconds to speak. If nothing, force the timer to start!
        maxWaitTimeoutRef.current = setTimeout(() => {
          console.log("VAD wait timeout reached. Forcing timer start.");
          setForceTimerActive(true); // Force Recorder to start ticking
          actualStartTimeRef.current = Date.now();
          startFallbackTimer(); // Start the 5s counting clock
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

  // Track exactly when they start speaking
  const handleVadSpeechStart = () => {
    if (maxWaitTimeoutRef.current) {
      // They spoke before the failsafe triggered!
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null; // Mark as cleared
      
      actualStartTimeRef.current = Date.now();
      startFallbackTimer(); // Start the 5s counting clock
    }
  };

  const handleVadSpeechEnd = () => {
    if (!actualStartTimeRef.current) return; // Ignore if triggered during the pre-start wait

    const timeElapsed = Date.now() - actualStartTimeRef.current;
    
    // FAILSAFE 2: Ignore if the speech was too short (a cough or bump)
    if (timeElapsed < CONFIG.MIN_COUNTING_MS) {
      console.log(`Ignored early VAD end trigger at ${timeElapsed}ms`);
      return; 
    }

    // Valid speech end! Cancel fallback and switch to silence
    clearTimeout(fallbackTimeoutRef.current);
    setPromptPhase((phase) => phase === 'counting' ? 'silence' : phase);
  };

  const getInstructionsText = () => {
    switch(promptPhase) {
      case 'pre-start': return "In the following task, your microphone and environment will be tested. First, count from 1 to 5 at your normal volume. Then, remain completely silent so we can measure the background noise. Click START to begin.";
      case 'counting': return "Count out loud from 1 to 5 at a normal volume and pace.";
      case 'silence': return "Now remain completely silent until the timer finishes.";
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
  const [phase, setPhase] = useState('checking'); // checking, warning, noise, analyzing, noise-failed, noise-success
  const [noiseScore, setNoiseScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [debugOutput, setDebugOutput] = useState(null); 
  const [errorType, setErrorType] = useState(null);

  const { 
    currentInstructions, 
    forceTimerActive, 
    handleRecordingStateChange, 
    handleVadSpeechStart, 
    handleVadSpeechEnd 
  } = useMicCheckInstructions();


  // Silently check permission on mount
  useEffect(() => {
    async function checkMicPermission() {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        setPhase(result.state === 'granted' ? 'noise' : 'warning');
      } catch (error) {
        setPhase('warning');
      }
    }
    if (navigator.permissions?.query) checkMicPermission();
    else setPhase('warning');
  }, []);

  // Process Recording
  const handleNoiseCheckComplete = async (taskData) => {
    setPhase('analyzing');
    const result = await calculateSNR(taskData.audioURL, taskData.speechSegments, taskData.recordingStartTime);
    setNoiseScore(result.snr ? result.snr.toFixed(1) : 0);
    setDebugOutput(result.debugData);
    setErrorType(result.error);
    setAttempts(prev => prev + 1);

    if (result.error === 'no-speech' || result.snr < CONFIG.TARGET_SNR) {
      setPhase('noise-failed');
    } else {
      setPhase('noise-success');
    }
  };

  // --- RENDER BLOCKS ---

  if (['checking', 'analyzing'].includes(phase)) {
    return (
      <div className="task-container">
        <div className="task-header">
          <div className="active-instructions pulse-animation">
            <h2><Trans i18nKey={`micCheck.${phase}`} /></h2>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'noise') {
    return (
      <Recorder
        key="noise-phase"
        title="Microphone Calibration"
        instructions={currentInstructions}
        mode="countDown"
        duration={CONFIG.RECORDING_DURATION}
        autoPermission={true}
        useVAD={true}
        showNextButton={true}
        onNextTask={handleNoiseCheckComplete} 
        showMicIcon={false}
        suppressSilenceWarning={true} 
        disableTimerFreeze={true}
        forceTimerActive={forceTimerActive}
        onRecordingStateChange={handleRecordingStateChange}
        onVadSpeechStart={handleVadSpeechStart}
        onVadSpeechEnd={handleVadSpeechEnd}
        vadConfigOverride={{ redemptionMs: CONFIG.VAD_REDEMPTION_MS }}
      />
    );
  }

  // Determine UI text for Action States
  const uiState = getUIStateContent(phase, noiseScore, errorType, onNext, () => setPhase('noise'));
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
              <Trans i18nKey="micCheck.btnProceed" />
            </button>
        )}
      </div>

      {CONFIG.DEBUG_MODE && debugOutput && <DebugPanel debugOutput={debugOutput} noiseScore={noiseScore} />}
    </div>
  );
}


// ==========================================
// 4. SUB-COMPONENTS & UTILITIES
// ==========================================

// Helper mapping for the Action screens (Warning, Success, Failed)
function getUIStateContent(phase, noiseScore, errorType, onNext, onRetry) {
  switch (phase) {
    case 'warning': return {
      title: <Trans i18nKey="micCheck.setupTitle" />,
      message: null,
      instructions: <>{<Trans i18nKey="micCheck.permissionWarning" />}<br /><br />{<Trans i18nKey="micCheck.permissionInstruction" />}</>,
      btnText: <Trans i18nKey="micCheck.btnUnderstand" />,
      onBtnClick: onRetry,
      isSuccess: false
    };
    
    case 'noise-failed': 
      // Check if the failure was specifically a hardware mute or disconnected mic
      if (errorType === 'muted') {
        return {
          title: <Trans i18nKey="micCheck.mutedTitle"/>,
          message: <Trans i18nKey="micCheck.mutedMessage"/>,
          instructions: <Trans i18nKey="micCheck.mutedInstructions" />,
          btnText: <Trans i18nKey="micCheck.btnTryAgain" />,
          onBtnClick: onRetry,
          isSuccess: false
        };
      }
      
      // If it failed because they didn't speak loud enough (or VAD failed)
      if (errorType === 'no-speech') {
        return {
          title: <Trans i18nKey="micCheck.noSpeechTitle" />,
          message: <Trans i18nKey="micCheck.noSpeechMessage"/>,
          instructions: <Trans i18nKey="micCheck.noSpeechInstructions" />,
          btnText: <Trans i18nKey="micCheck.btnTryAgain" />,
          onBtnClick: onRetry,
          isSuccess: false
        };
      }

      // Default failure (SNR too low / too much background noise)
      return {
        title: <Trans i18nKey="micCheck.failedTitle" />,
        message: <Trans i18nKey="micCheck.failedMessage"/>,
        instructions: <Trans i18nKey="micCheck.failedInstructions" />,
        btnText: <Trans i18nKey="micCheck.btnTryAgain" />,
        onBtnClick: onRetry,
        isSuccess: false
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