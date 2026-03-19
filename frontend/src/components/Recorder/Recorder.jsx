import React, { useState, useRef, useEffect } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import './Recorder.css';
import { RecordingTimer } from './RecordingTimer';
import { StatusIndicator } from './StatusIndicator';
import { RecordingControls } from './RecordingControls';
import { PlaybackSection } from './PlaybackSection';
import { AudioExampleButton } from './AudioExampleButton';

const DEBUG_MODE = false; //import.meta.env.VITE_DEBUG_MODE === 'true';

// VAD config - all parameters
const VAD_CONFIG = {
    // TIMING
    silenceFreezeMs: 3000,       // time until the timer freezes (and warning appears for static tasks)
    adaptiveSwitchMs: 5000,      // time until the topic automatically switches (Dynamic Tasks only)
    earlyStopMs: 10000,          // total silence time on static task (or last dynamic topic) before early stop unlocks
    
    // TUNED PARAMETERS FOR LONG SPEECH (https://docs.vad.ricky0123.com/user-guide/algorithm/#configuration)
    positiveSpeechThreshold: 0.5, // determines the threshold over which a probability is considered to indicate the presence of speech, default: 0.3
    negativeSpeechThreshold: 0.45, // determines the threshold under which a probability is considered to indicate the absence of speech, default: 0.25
    redemptionMs: 1500, // number of milliseconds of speech-negative frames to wait before ending a speech segment, default: 1400
    preSpeechPadMs: 800, // number of milliseconds of audio to prepend to a speech segment. default: 800
    minSpeechMs: 600, // minimum duration in milliseconds for a speech segment, default: 400
};
   
// components/Recorder/Recorder.jsx - Main component
export const Recorder = ({ 
    title = "🎙️ Task Recorder",
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
    taskParams = {},
    recordVideo = false
}) => {
    // --- Phase State ---
    // If video is required, start in SETUP. Otherwise, jump straight to RECORDING.
    const isVideoEnabled = String(recordVideo) === 'true';
    const [phase, setPhase] = useState(isVideoEnabled ? 'SETUP' : 'RECORDING');

    // --- VAD State & Logic ---
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSilentPause, setIsSilentPause] = useState(false);
    const [canEarlyStop, setCanEarlyStop] = useState(false);
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

    // --- Video Recorder Hook ---
    const videoRecorder = useVideoRecorder({
        debugMode: DEBUG_MODE,
        onRecordingComplete: (videoData) => {
            console.log("Video data processed!", videoData);
            // TODO: Merge this with audio data in the next step!
        }
    });

    // --- Voice Recorder Hook ---
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
        permission: audioPermission,
        stream,
        audioURL,
        recordingTime,
        audioLevels,
        activeInstructions,
        durationExpired,
        getMicrophonePermission,
        startRecording: startAudioRecording,
        pauseRecording,
        resumeRecording,
        stopRecording: stopAudioRecording,
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

                    // Check for Early Stop (Triggered at 10s on static tasks or final topic)
                    if (!hasMoreTopics && silenceDuration >= VAD_CONFIG.earlyStopMs) {
                        setCanEarlyStop(true);
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
                    onnxWASMBasePath: `${import.meta.env.BASE_URL}vad/`,
                    baseAssetPath: `${import.meta.env.BASE_URL}vad/`,
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
                        setCanEarlyStop(false);
                        lastSpeechTimeRef.current = Date.now(); // Reset silence clock

                        if (statusRef.current === RECORDING_STATES.RECORDING) {
                            currentSpeechStart.current = Date.now();
                        }
                    },
                    onVADMisfire: () => {
                        // A misfire (throat clear) counts as a sound, so we reset the 4s clock!
                        isSpeakingRef.current = false;
                        setIsSpeaking(false);
                        setIsSilentPause(false);
                        setCanEarlyStop(false);
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
            setIsSilentPause(false);
            setCanEarlyStop(false);
        } else {
            vadInstance.current.pause();
            setIsSilentPause(false);
            setCanEarlyStop(false);
        }
    }, [recordingStatus, useVAD, RECORDING_STATES.RECORDING]);

    // --- Wrappers ---
    const handleStart = () => {
        onLogEvent("button_start");
        setHasSpoken(false); 
        setIsSilentPause(false);
        setCanEarlyStop(false);
        setSpeechProb(0);
        lastSpeechTimeRef.current = Date.now(); 
        
        // Start audio
        startAudioRecording();
        
        // Start video if enabled
        if (isVideoEnabled) {
            videoRecorder.startRecording();
            setPhase('RECORDING');
        }
    };

    const handleStop = () => {
        stopAudioRecording();
        if (isVideoEnabled) {
            videoRecorder.stopRecording();
        }
    };

    const handleRepeat = () => {
        onLogEvent("button_repeat");
        speechSegments.current = []; 
        currentSpeechStart.current = null;
        setDynamicIndex(0);
        setHasSpoken(false); 
        setIsSpeaking(false);
        setIsSilentPause(false);
        setCanEarlyStop(false);
        setSpeechProb(0);
        lastSpeechTimeRef.current = Date.now();

        repeatRecording();

        // Send user back to SETUP phase if video is enabled
        if (isVideoEnabled) {
            setPhase('SETUP');
        }
    };

    // We pass the logger to the example button so it can log clicks itself
    const handlePlayExample = () => {
        onLogEvent("button_illustration");
        playExample();
    };

    // Auto-request permission on mount if enabled
    React.useEffect(() => {
        if (autoPermission) {
            if (isVideoEnabled) {
                videoRecorder.getMediaPermission(); // Gets both mic and camera
            } else {
                getMicrophonePermission(); // Gets only mic
            }
        }
    }, [autoPermission, isVideoEnabled]);

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
            speechSegments: speechSegments.current,
            // If video was recorded, attach its specific data output here
            ...(isVideoEnabled && videoRecorder.videoData && { videoData: videoRecorder.videoData })
        };
        console.log("Saving Task Data:", taskData);
        
        // Call the parent's provided function
        onNextTask(taskData);
    };

    // Start Video Calibration
    const handleStartCalibration = async () => {
        const hasPermission = await videoRecorder.getMediaPermission();
        if (hasPermission) {
            setPhase('CALIBRATE');
            videoRecorder.startFaceDetection();
        } else {
            console.error("Camera/Mic permission denied or failed.");
        }
    };

    // --- Toggle Logic ---
    const handleToggleExample = () => {
        if (voiceRecorder.exampleAudio) {
            voiceRecorder.stopExample(); 
        } else {
            handlePlayExample(); 
        }
    };

    // --- Updated Formatter Function ---
    const formatInstructionsWithButton = (text, buttonComponent) => {
        if (!text || !text.includes('{{example}}')) return text;

        const parts = text.split('{{example}}');
        return (
            <>
                {parts[0]}
                {/* Wrapping in a div ensures it takes its own row */}
                <div className="instruction-example-row">
                    {buttonComponent}
                </div>
                {parts[1]}
            </>
        );
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

    // Button Component for an example
    const inlineExampleButton = exampleExists ? (
        <AudioExampleButton 
            recordingStatus={recordingStatus}
            audioExample={audioExample} 
            isPlaying={!!voiceRecorder.exampleAudio} 
            onToggle={handleToggleExample}
        />
    ) : null;

    // Format the display instructions
    displayInstructions = formatInstructionsWithButton(displayInstructions, inlineExampleButton);

    // OVERRIDE INSTRUCTIONS FOR CALIBRATION PHASE (Applies to ALL task types) ---
    const isCalibrationPhase = isVideoEnabled && (phase === 'SETUP' || phase === 'CALIBRATE');
    
    if (isCalibrationPhase) {
        displayInstructions = "To ensure accurate results, please rest your arm on a table to hold the phone completely steady. Follow instructions during the calibration and try to position your face within the frame. It is very important that you do not move the phone once the calibration is complete.";
    }

    return (
        <div className={`task-container ${className} vad-${vadVisualState}`}>
            <h1>{isCalibrationPhase ? "📷 Camera Setup" : title}</h1>
            <div
                key={isCalibrationPhase ? 'calibration' : (isAdaptiveSwitching ? dynamicIndex : 'static')} 
                className={`active-instructions`}
            >
                {displayInstructions}
            </div>

            {isVideoEnabled && (
                <div className={`viewfinder-container ${phase === 'RECORDING' ? 'pip-mode' : ''} ${(recordingStatus === RECORDING_STATES.RECORDING && (!videoRecorder.isSteady || !videoRecorder.isFaceCorrect)) ? 'warning-border' : ''}`}>
                    <video ref={videoRecorder.videoRef} autoPlay playsInline muted className="viewfinder" />
                    
                    {phase === 'CALIBRATE' && (
                        <canvas ref={videoRecorder.canvasRef} className="mesh-canvas" />
                    )}

                    {/* Calibration Overlay */}
                    {phase === 'CALIBRATE' && (
                        <div className="calibration-overlay">
                            <div className={`face-oval ${videoRecorder.isSteady && videoRecorder.isFaceCorrect ? 'ready' : ''}`}>
                                {videoRecorder.guidance?.arrow === 'MOVE_UP' && <div className="calib-icon icon-up">⇧</div>}
                                {videoRecorder.guidance?.arrow === 'MOVE_DOWN' && <div className="calib-icon icon-down">⇩</div>}
                                {videoRecorder.guidance?.arrow === 'MOVE_LEFT' && <div className="calib-icon icon-left">⇦</div>}
                                {videoRecorder.guidance?.arrow === 'MOVE_RIGHT' && <div className="calib-icon icon-right">⇨</div>}
                                {videoRecorder.guidance?.arrow === 'READY'}
                            </div>
                            <div className="warning-toast">
                                {videoRecorder.guidance?.text}
                            </div>
                        </div>
                    )}

                    {/* Recording Phase Warning Overlay */}
                    {phase === 'RECORDING' && recordingStatus === RECORDING_STATES.RECORDING && (!videoRecorder.isSteady || !videoRecorder.isFaceCorrect) && (
                        <div className="recording-alert-overlay">
                            <div className="alert-box">
                                ⚠️ {!videoRecorder.isSteady ? "Hold Phone Steady!" : (videoRecorder.faceMessage || "Adjust your face!")}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- PHASE 1: VIDEO SETUP CONTROLS --- */}
            {isVideoEnabled && phase === 'SETUP' && (
                <div className="controls-container" style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <button className="btn-primary" onClick={handleStartCalibration}>
                        Start Camera Calibration
                    </button>
                </div>
            )}

            {/* --- PHASE 2: VIDEO CALIBRATION CONTROLS --- */}
            {isVideoEnabled && phase === 'CALIBRATE' && (
                <div className="controls-container" style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <button 
                        className="btn-primary" 
                        disabled={!(videoRecorder.isSteady && videoRecorder.isFaceCorrect)} 
                        onClick={() => { setPhase('RECORDING'); }}
                    >
                        {(videoRecorder.isSteady && videoRecorder.isFaceCorrect) ? "Position Correct - Continue" : "Awaiting Correct Position..."}
                    </button>
                </div>
            )}

            {/* --- PHASE 3: RECORDING CONTROLS (Audio Timer + Start/Stop) --- */}
            {phase === 'RECORDING' && (
                <>
                    <div className={`recording-area`}>
                        <RecordingTimer
                            time={recordingTime}
                            remainingTime={voiceRecorder.remainingTime}
                            status={recordingStatus}
                            audioLevels={audioLevels}
                            showVisualizer={showVisualizer}
                            isReadyToStop={(!(mode === 'countDown') && durationExpired) || canEarlyStop || mode === 'basicStop'}
                        >
                        </RecordingTimer>

                        {/* VAD Probability Debug Bar */}
                        {useVAD && recordingStatus === RECORDING_STATES.RECORDING && DEBUG_MODE && (
                            <div style={{ marginTop: '15px', fontSize: '0.85rem', color: '#666', textAlign: 'center', fontFamily: 'monospace' }}>
                                <div>Speech Probability: {(speechProb * 100).toFixed(1)}%</div>
                                <div style={{ width: '200px', height: '6px', background: '#e0e0e0', borderRadius: '3px', margin: '6px auto', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(speechProb * 100, 100)}%`, height: '100%', background: speechProb >= 0.5 ? '#4caf50' : '#9e9e9e', transition: 'width 0.1s linear, background 0.1s' }} />
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
                    
                    {DEBUG_MODE &&
                        <StatusIndicator status={recordingStatus} />
                    }
                    

                    <div className="bottom-controls">
                        <RecordingControls
                            recordingStatus={recordingStatus}
                            disableControls={mode === 'countDown'}
                            permission={audioPermission}
                            onStart={handleStart}
                            onPause={pauseRecording}
                            onResume={resumeRecording}
                            onStop={handleStop}
                            onPermission={getMicrophonePermission}
                            disableStop={mode === 'delayedStop' && !durationExpired && !canEarlyStop}
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
                </>
            )}
        </div>
    );
};
