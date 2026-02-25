import React, { useState, useRef, useEffect } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import './VoiceRecorder.css';
import { RecordingTimer } from './RecordingTimer';
import { StatusIndicator } from './StatusIndicator';
import { RecordingControls } from './RecordingControls';
import { PlaybackSection } from './PlaybackSection';
import { AudioExampleButton } from './AudioExampleButton';


// components/VoiceRecorder/VoiceRecorder.jsx - Main component
export const VoiceRecorder = ({ 
    title = "🎙️ Voice Recorder",
    instructions = "Record, pause, resume, and save your audio with real-time visualization",
    instructionsActive,
    audioExample,
    mode,
    duration,
    onNextTask,
    onRecordingComplete = () => {},
    onLogEvent = () => {},
    onError = (err) => console.error(err),
    showVisualizer = true,
    autoPermission = true,
    showNextButton = true,
    className = "",
    useVAD = false, 
    vadSilenceThreshold = 4000 // 4 seconds of silence before warning
}) => {
    // --- VAD State & Logic ---
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [showSilenceWarning, setShowSilenceWarning] = useState(false);
    const [hasSpoken, setHasSpoken] = useState(false);
    const [speechProb, setSpeechProb] = useState(0);

    const voiceRecorder = useVoiceRecorder({
        onRecordingComplete,
        onError,
        instructions,
        instructionsActive,
        audioExample,
        mode,
        duration,
        // If VAD is on, freeze timer until participant speaks. Otherwise, normal timer.
        isTimerActive: !useVAD || (hasSpoken && !showSilenceWarning)
    });

    const {
        recordingStatus,
        permission,
        stream,
        audioURL,
        recordingTime,
        audioLevels,
        activeInstructions,
        durationExpired,
        getMicrophonePermission,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        repeatRecording,
        playExample,
        stopExample,
        RECORDING_STATES
    } = voiceRecorder;

    const vadInstance = useRef(null);
    const statusRef = useRef(recordingStatus);

    // Speech Metadata Trackers
    const isSpeakingRef = useRef(false);
    const lastSpeechTimeRef = useRef(Date.now()); 
    const speechSegments = useRef([]);
    const currentSpeechStart = useRef(null);

    // Keep our reference to the recording status fresh for the AI callbacks
    useEffect(() => {
        statusRef.current = recordingStatus;
        // Fresh 4 seconds whenever Start or Resume is hitted
        if (recordingStatus === RECORDING_STATES.RECORDING) {
            lastSpeechTimeRef.current = Date.now();
        }
    }, [recordingStatus, RECORDING_STATES.RECORDING]);

    // 1. This guarantees exactly 4 seconds of true silence before warning
    useEffect(() => {
        if (!useVAD) return;

        const interval = setInterval(() => {
            if (statusRef.current === RECORDING_STATES.RECORDING) {
                if (isSpeakingRef.current) {
                    // While speaking, freeze the countdown clock
                    lastSpeechTimeRef.current = Date.now();
                } else {
                    // While silent, check if 4 seconds have passed since they stopped
                    const silenceDuration = Date.now() - lastSpeechTimeRef.current;
                    if (silenceDuration >= vadSilenceThreshold) {
                        setShowSilenceWarning(true);
                    }
                }
            }
        }, 500); // Check every half second

        return () => clearInterval(interval);
    }, [useVAD, vadSilenceThreshold]);

    // 2. Initialize the VAD AI Model
    useEffect(() => {
        if (!useVAD || !stream) return;

        const initVAD = async () => {
            if (!window.vad) {
                console.error("VAD script is missing! Make sure script tags are in index.html");
                return;
            }

            try {
                // Instantiate the local model
                vadInstance.current = await window.vad.MicVAD.new({
                    stream: stream, 
                    onnxWASMBasePath: "/vad/",
                    baseAssetPath: "/vad/",
                    // TUNED PARAMETERS FOR LONG SPEECH (https://docs.vad.ricky0123.com/user-guide/algorithm/#configuration)
                    positiveSpeechThreshold: 0.5, // determines the threshold over which a probability is considered to indicate the presence of speech, default: 0.3
                    negativeSpeechThreshold: 0.45, // determines the threshold under which a probability is considered to indicate the absence of speech, default: 0.25
                    redemptionMs: 2000, // number of milliseconds of speech-negative frames to wait before ending a speech segment, default: 1400
                    preSpeechPadMs: 500, // number - number of milliseconds of audio to prepend to a speech segment. default: 800
                    minSpeechMs: 600, // minimum duration in milliseconds for a speech segment, default: 400
                    
                    onFrameProcessed: (probs) => {
                        // Updates the UI state 30 times a second!
                        setSpeechProb(probs.isSpeech); 
                    },
                    onSpeechStart: () => {
                        isSpeakingRef.current = true;
                        setIsSpeaking(true);
                        setHasSpoken(true);
                        setShowSilenceWarning(false); // Instantly hide warning
                        lastSpeechTimeRef.current = Date.now(); // Reset silence clock

                        if (statusRef.current === RECORDING_STATES.RECORDING) {
                            currentSpeechStart.current = Date.now();
                        }
                    },
                    onVADMisfire: () => {
                        // A misfire (throat clear) counts as a sound, so we reset the 4s clock!
                        isSpeakingRef.current = false;
                        setIsSpeaking(false);
                        lastSpeechTimeRef.current = Date.now(); 
                    },
                    onSpeechEnd: () => {
                        isSpeakingRef.current = false;
                        setIsSpeaking(false);
                        
                        // The exact millisecond they stopped speaking. The 4s countdown starts NOW.
                        lastSpeechTimeRef.current = Date.now(); 

                        if (statusRef.current === RECORDING_STATES.RECORDING && currentSpeechStart.current) {
                            speechSegments.current.push({
                                startTime: currentSpeechStart.current,
                                endTime: Date.now(),
                                durationMs: Date.now() - currentSpeechStart.current
                            });
                            currentSpeechStart.current = null; 
                        }
                    },
                });

                // If user clicked record while the AI was still loading, start it immediately
                if (statusRef.current === RECORDING_STATES.RECORDING) {
                    vadInstance.current.start();
                }
            } catch (error) {
                console.error("Failed to load VAD model:", error);
            }
        };

        initVAD();

        // Cleanup: pause and destroy the AI when leaving the page
        return () => {
            if (vadInstance.current) {
                vadInstance.current.pause();
                vadInstance.current = null;
            }
        };
    }, [useVAD, stream, RECORDING_STATES.RECORDING]);

    // Save final segment if user hits Stop mid-sentence
    useEffect(() => {
        if (recordingStatus === RECORDING_STATES.RECORDED && currentSpeechStart.current) {
            speechSegments.current.push({
                startTime: currentSpeechStart.current,
                endTime: Date.now(),
                durationMs: Date.now() - currentSpeechStart.current
            });
            currentSpeechStart.current = null;
        }
    }, [recordingStatus, RECORDING_STATES.RECORDED]);

    // Sync VAD Engine with Pause/Play
    useEffect(() => {
        if (!useVAD || !vadInstance.current) return;
        if (recordingStatus === RECORDING_STATES.RECORDING) {
            vadInstance.current.start();
            setShowSilenceWarning(false);
        } else {
            vadInstance.current.pause();
            setShowSilenceWarning(false);
        }
    }, [recordingStatus, useVAD, RECORDING_STATES.RECORDING]);

    // --- Wrappers ---
    const handleStart = () => {
        onLogEvent("button_start");
        setHasSpoken(false); 
        setShowSilenceWarning(false);
        startRecording();
    };

    const handleRepeat = () => {
        onLogEvent("button_repeat");
        speechSegments.current = []; // Clear old metadata
        currentSpeechStart.current = null;
        repeatRecording();
    };

    // We pass the logger to the example button so it can log clicks itself
    const handlePlayExample = () => {
        onLogEvent("button_illustration");
        playExample();
    };

    // Auto-request permission on mount if enabled
    React.useEffect(() => {
        if (autoPermission) {
            getMicrophonePermission();
        }
    }, [autoPermission]);

    const [exampleExists, setExampleExists] = React.useState(false);

    React.useEffect(() => {
        async function checkExample() {
          if (!audioExample) return;
          try {
            const res = await fetch(audioExample, { method: "HEAD" });
            const type = res.headers.get("content-type") || "";
            const ok = res.ok && type.includes("audio");
            console.log(`Checking example: ${audioExample} → ${res.status} ${type} ok=${ok}`);
            setExampleExists(ok);
          } catch {
            setExampleExists(false);
          }
        }
        checkExample();
      }, [audioExample]);
      


    const handleNextTask = () => {
        if (!onNextTask) return;

        // Prepare task data to be saved
        const taskData = {
            audioURL: audioURL,
            recordingTime: recordingTime,
            timestamp: new Date().toISOString(),
            taskTitle: title,
            taskType: 'voice',
            speechSegments: speechSegments.current
        };
        console.log(speechSegments.current)
        
        // Call the parent's provided function
        onNextTask(taskData);
    };

    // Determine the visual state of the recorder for CSS styling
    let vadVisualState = "idle";
    let vadStatusText = "";
    
    if (useVAD && recordingStatus === RECORDING_STATES.RECORDING) {
        if (!hasSpoken) {
            vadVisualState = "waiting";
            vadStatusText = "Feel free to start whenever you want! Waiting for you to speak...";
        } else if (showSilenceWarning) {
            vadVisualState = "warning";
            vadStatusText = "Are you still there? Please continue or click on Stop if possible...";
        } else if (isSpeaking) {
            vadVisualState = "speaking";
        }
    }

    return (
        <div className={`task-container ${className} vad-${vadVisualState}`}>
            <h1>{title}</h1>
            <p>{activeInstructions}</p>
            <div className={`recording-area`}>

                <RecordingTimer
                time={recordingTime}
                remainingTime={voiceRecorder.remainingTime}
                status={recordingStatus}
                audioLevels={audioLevels}
                showVisualizer={showVisualizer}
                >
                {exampleExists && (
                    <AudioExampleButton 
                    recordingStatus={recordingStatus}
                    audioExample={audioExample} 
                    playExample={handlePlayExample} 
                    />
                )}
                </RecordingTimer>

                {/* NEW: VAD Probability Debug Bar (Only visible when Recording & VAD active) */}
                {useVAD && recordingStatus === RECORDING_STATES.RECORDING && (
                    <div style={{ marginTop: '15px', fontSize: '0.85rem', color: '#666', textAlign: 'center', fontFamily: 'monospace' }}>
                        <div>Speech Probability: {(speechProb * 100).toFixed(1)}%</div>
                        <div style={{ width: '200px', height: '6px', background: '#e0e0e0', borderRadius: '3px', margin: '6px auto', overflow: 'hidden' }}>
                            <div style={{ 
                                width: `${Math.min(speechProb * 100, 100)}%`, 
                                height: '100%', 
                                background: speechProb >= 0.5 ? '#4caf50' : '#9e9e9e', 
                                transition: 'width 0.1s linear, background 0.1s' 
                            }} />
                        </div>
                    </div>
                )}

                {useVAD && vadStatusText && (
                    <div className="vad-status-wrapper">
                        <div className={`vad-status-pill vad-pill-${vadVisualState}`}>
                            {vadVisualState === 'waiting' && <span className="vad-icon">⏳</span>}
                            {vadVisualState === 'warning' && <span className="vad-icon">👋</span>}
                            <span>{vadStatusText}</span>
                        </div>
                    </div>
                )}

            </div>
            
            <StatusIndicator status={recordingStatus} />

            <div className="bottom-controls">
            <RecordingControls
            recordingStatus={recordingStatus}
            disableControls={mode === 'countDown'}
            permission={permission}
            onStart={handleStart}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onStop={stopRecording}
            onPermission={getMicrophonePermission}
            disableStop={mode === 'delayedStop' && !durationExpired}
            showPause={false}
            RECORDING_STATES={RECORDING_STATES}
            />

            <PlaybackSection
            audioURL={audioURL}
            recordingStatus={recordingStatus}
            onRepeat={handleRepeat}
            onNextTask={handleNextTask}
            showNextButton={showNextButton}
            />
            </div>

        </div>
    );
};
