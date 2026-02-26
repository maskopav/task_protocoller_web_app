import React, { useState, useRef, useEffect } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import './VoiceRecorder.css';
import { RecordingTimer } from './RecordingTimer';
import { StatusIndicator } from './StatusIndicator';
import { RecordingControls } from './RecordingControls';
import { PlaybackSection } from './PlaybackSection';
import { AudioExampleButton } from './AudioExampleButton';

// VAD config - all parameters
const VAD_CONFIG = {
    // TIMING
    silenceFreezeMs: 3000,       // time until the timer freezes (and warning appears for static tasks)
    adaptiveSwitchMs: 5000,      // time until the topic automatically switches (Dynamic Tasks only)
    
    // TUNED PARAMETERS FOR LONG SPEECH (https://docs.vad.ricky0123.com/user-guide/algorithm/#configuration)
    positiveSpeechThreshold: 0.5, // determines the threshold over which a probability is considered to indicate the presence of speech, default: 0.3
    negativeSpeechThreshold: 0.45, // determines the threshold under which a probability is considered to indicate the absence of speech, default: 0.25
    redemptionMs: 1500, // number of milliseconds of speech-negative frames to wait before ending a speech segment, default: 1400
    preSpeechPadMs: 800, // number - number of milliseconds of audio to prepend to a speech segment. default: 800
    minSpeechMs: 600, // minimum duration in milliseconds for a speech segment, default: 400
};
                    
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
    taskParams = {} 
}) => {
    // --- VAD State & Logic ---
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSilentPause, setIsSilentPause] = useState(false);
    const [hasSpoken, setHasSpoken] = useState(false);
    const [speechProb, setSpeechProb] = useState(0);

    // --- Dynamic Task Detection ---
    const dynamicArrayParam = Object.values(taskParams).find(val => Array.isArray(val));
    const dynamicArray = Array.isArray(dynamicArrayParam) ? dynamicArrayParam : [];
    const isDynamicTask = dynamicArray.length > 0;
    const isAdaptiveSwitching = dynamicArray.length > 1;
    
    const [dynamicIndex, setDynamicIndex] = useState(0);

    // --- UI Logic: When to show the actual warning about silence
    const isLastTopic = !isAdaptiveSwitching || dynamicIndex >= dynamicArray.length - 1;
    // We only bug the user with a warning if the timer is frozen AND there are no more topics to show them!
    const showSilenceWarning = isSilentPause && isLastTopic;
    const canEarlyStop = showSilenceWarning;

    const voiceRecorder = useVoiceRecorder({
        onRecordingComplete,
        onError,
        instructions,
        instructionsActive,
        audioExample,
        mode,
        duration,
        // If VAD is on, freeze timer until participant speaks. Otherwise, normal timer.
        isTimerActive: !useVAD || (hasSpoken && !isSilentPause)
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

    // Adaptive tasks
    useEffect(() => {
        if (!useVAD) return;

        const interval = setInterval(() => {
            if (statusRef.current === RECORDING_STATES.RECORDING) {
                if (isSpeakingRef.current) {
                    lastSpeechTimeRef.current = Date.now();
                } else {
                    const silenceDuration = Date.now() - lastSpeechTimeRef.current;
                    const hasMoreTopics = isAdaptiveSwitching && dynamicIndex < dynamicArray.length - 1;
                    
                    // Check for Timer Freeze (Triggered at 3s)
                    if (silenceDuration >= VAD_CONFIG.silenceFreezeMs) {
                        setIsSilentPause(true); // Freezes the clock immediately
                    }

                    // Check for Topic Switch (Triggered at 5s, Dynamic Tasks only)
                    if (hasMoreTopics && silenceDuration >= VAD_CONFIG.adaptiveSwitchMs) {
                        setDynamicIndex(prev => prev + 1);
                        lastSpeechTimeRef.current = Date.now(); // Reset silence clock for the new topic
                    }
                }
            }
        }, 500); 

        return () => clearInterval(interval);
    }, [useVAD, isAdaptiveSwitching, dynamicArray.length, dynamicIndex, RECORDING_STATES.RECORDING]);

    // Initialize the VAD AI Model
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
                    positiveSpeechThreshold: VAD_CONFIG.positiveSpeechThreshold, 
                    negativeSpeechThreshold: VAD_CONFIG.negativeSpeechThreshold,
                    redemptionMs: VAD_CONFIG.redemptionMs,
                    preSpeechPadMs: VAD_CONFIG.preSpeechPadMs,
                    minSpeechMs: VAD_CONFIG.minSpeechMs,
                    
                    onFrameProcessed: (probs) => {
                        // Updates the UI state 30 times a second!
                        setSpeechProb(probs.isSpeech); 
                    },
                    onSpeechStart: () => {
                        isSpeakingRef.current = true;
                        setIsSpeaking(true);
                        setHasSpoken(true);
                        setIsSilentPause(false); 
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
                        setIsSilentPause(false);
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
            setIsSilentPause(false);
        } else {
            vadInstance.current.pause();
            setIsSilentPause(false);
        }
    }, [recordingStatus, useVAD, RECORDING_STATES.RECORDING]);

    // --- Wrappers ---
    const handleStart = () => {
        onLogEvent("button_start");
        setHasSpoken(false); 
        setIsSilentPause(false);
        startRecording();
    };

    const handleRepeat = () => {
        onLogEvent("button_repeat");
        speechSegments.current = []; 
        currentSpeechStart.current = null;
        setDynamicIndex(0);
        setIsSilentPause(false);
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
            vadStatusText = canEarlyStop 
                ? "If you have nothing more to say, you can click Stop to finish." 
                : "Are you still there? Please continue...";
        } else if (isSpeaking) {
            vadVisualState = "speaking";
        }
    }

    // --- INSTRUCTION INTERPOLATION ---
    let displayInstructions = activeInstructions;
    if (isDynamicTask && activeInstructions) {
        const currentItem = dynamicArray[dynamicIndex];
        if (typeof currentItem === 'object' && currentItem !== null) {
            Object.entries(currentItem).forEach(([key, value]) => {
                const regex = new RegExp(`{{${key}}}`, 'g');
                displayInstructions = displayInstructions.replace(regex, String(value));
            });
        } else if (typeof currentItem === 'string') {
            const paramKey = Object.keys(taskParams).find(k => taskParams[k] === dynamicArray);
            if (paramKey) {
                const regex = new RegExp(`{{${paramKey}}}`, 'g');
                displayInstructions = displayInstructions.replace(regex, currentItem);
            }
        }
    }

    return (
        <div className={`task-container ${className} vad-${vadVisualState}`}>
            <h1>{title}</h1>
            {/* The key={dynamicIndex} forces React to replay the CSS animation every time it changes */}
            <p 
                key={isAdaptiveSwitching ? dynamicIndex : 'static'} 
                className={`active-instructions ${isAdaptiveSwitching ? 'dynamic-topic-text' : ''}`}
            >
                {displayInstructions}
            </p>
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

                {/* VAD Probability Debug Bar (Only visible when Recording & VAD active) */}
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
