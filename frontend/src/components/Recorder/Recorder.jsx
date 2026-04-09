import React, { useState, useRef, useEffect } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import './Recorder.css';
import { RecordingTimer } from './RecordingTimer';
import { StatusIndicator } from './StatusIndicator';
import { RecordingControls } from './RecordingControls';
import { PlaybackSection } from './PlaybackSection';
import { AudioExampleButton } from './AudioExampleButton';
import FormattedText from "../FormattedText/FormattedText";
import { useConfirm } from '../ConfirmDialog/ConfirmDialogContext';
import { logToServer } from '../../utils/frontendLogger';
import { IncompatibleBrowser } from './IncompatibleBrowser';

const DEBUG_MODE = false; //import.meta.env.VITE_DEBUG_MODE === 'true';

const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox'))  return { browser: 'Firefox',  ua };
    if (ua.includes('Edg/'))     return { browser: 'Edge',     ua };
    if (ua.includes('OPR/') || ua.includes('Opera/')) return { browser: 'Opera', ua };
    if (ua.includes('Chrome'))   return { browser: 'Chrome',   ua };
    if (ua.includes('Safari'))   return { browser: 'Safari',   ua };
    return { browser: 'Unknown', ua };
};

// VAD config - all parameters
const VAD_CONFIG = {
    // TIMING
    silenceFreezeMs: 3000,       // time until the timer freezes (and warning appears for static tasks)
    topicPromptDelayMs: 9500,      // time until the topic automatically switches (Dynamic Tasks only)
    earlyStopMs: 13500,          // total silence time on static task (or last dynamic topic) before early stop unlocks
    
    // TUNED PARAMETERS FOR LONG SPEECH (https://docs.vad.ricky0123.com/user-guide/algorithm/#configuration)
    positiveSpeechThreshold: 0.35, // determines the threshold over which a probability is considered to indicate the presence of speech, default: 0.3
    negativeSpeechThreshold: 0.25, // determines the threshold under which a probability is considered to indicate the absence of speech, default: 0.25
    redemptionMs: 1500, // number of milliseconds of speech-negative frames to wait before ending a speech segment, default: 1400
    preSpeechPadMs: 800, // number of milliseconds of audio to prepend to a speech segment. default: 800
    minSpeechMs: 500, // minimum duration in milliseconds for a speech segment, default: 400
};
   
// components/Recorder/Recorder.jsx - Main component
export const Recorder = ({ 
    title = "🎙️ Task Recorder",
    instructions = "Record, pause, resume, and save your audio with real-time visualization",
    instructionsActive,
    completedInstructions = "The task was completed successfully. You can proceed to the next task, try again if you are not satisfied, or listen to your recording below.",
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
    vadConfigOverride = {},        
    suppressSilenceWarning = false, 
    disableTimerFreeze = false,
    forceTimerActive = false,
    onVadSpeechStart = null,              
    onVadSpeechEnd = null,
    taskParams = {},
    recordVideo = false,
    hideTitle = false,
    showMicIcon,
    onRecordingStateChange,
    autoSubmit = false
}) => {
    // --- Phase State ---
    // If video is required, start in SETUP. Otherwise, jump straight to RECORDING.
    const isVideoEnabled = String(recordVideo) === 'true';
    const [phase, setPhase] = useState(isVideoEnabled ? 'SETUP' : 'RECORDING');

    // --- VAD State & Logic ---
    const [isVadLoaded, setIsVadLoaded] = useState(!useVAD);
    const [vadFailed, setVadFailed] = useState(false);
    const activeUseVAD = useVAD && !vadFailed;

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSilentPause, setIsSilentPause] = useState(false);
    const [canEarlyStop, setCanEarlyStop] = useState(false);
    const [hasSpoken, setHasSpoken] = useState(false);
    const [speechProb, setSpeechProb] = useState(0);

    // --- Dynamic Task Detection ---
    const dynamicArrayParam = Object.values(taskParams).find(val => Array.isArray(val));
    const dynamicArray = Array.isArray(dynamicArrayParam) ? dynamicArrayParam : [];
    const isDynamicTask = dynamicArray.length > 0

    const [dynamicIndex, setDynamicIndex] = useState(0);
    const [promptTopicSwitch, setPromptTopicSwitch] = useState(false);
    const [awaitingNextTopic, setAwaitingNextTopic] = useState(false);

    const confirm = useConfirm();

    // Extract maxDuration from the parameters set by the Admin
    const { maxDuration } = taskParams;

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
        maxDuration,
        // If VAD is on, freeze timer until participant speaks. Otherwise, normal timer.
        isTimerActive: forceTimerActive || !activeUseVAD || (hasSpoken && (disableTimerFreeze || !isSilentPause))
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
        incompatibleBrowser,
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

    // Calculate Stop Button & Warning Logic 
    const isReadyToStop = (!(mode === 'countDown') && durationExpired) || canEarlyStop || mode === 'basicStop';
    const showSilenceWarning = isSilentPause && !suppressSilenceWarning && !isReadyToStop;

    const vadInstance = useRef(null);
    const statusRef = useRef(recordingStatus);
    const isInitializingVad = useRef(false);

    // Speech Metadata Trackers
    const isSpeakingRef = useRef(false);
    const hasSpokenRef = useRef(false);
    const lastSpeechTimeRef = useRef(Date.now()); 
    const speechSegments = useRef([]);
    const currentSpeechStart = useRef(null);
    const recordingStartTimeRef = useRef(null);
    
    // Keep our reference to the recording status fresh for the AI callbacks
    useEffect(() => {
        statusRef.current = recordingStatus;
        // Fresh 4 seconds whenever Start or Resume is hitted
        if (recordingStatus === RECORDING_STATES.RECORDING) {
            lastSpeechTimeRef.current = Date.now();
        }
    }, [recordingStatus, RECORDING_STATES.RECORDING]);

    useEffect(() => {
        if (onRecordingStateChange) {
            onRecordingStateChange(recordingStatus === RECORDING_STATES.RECORDING);
        }
    }, [recordingStatus, onRecordingStateChange, RECORDING_STATES.RECORDING]);

    // Adaptive tasks
    useEffect(() => {
        if (!activeUseVAD) return;

        const interval = setInterval(() => {
            if (statusRef.current === RECORDING_STATES.RECORDING && !awaitingNextTopic) {
                if (isSpeakingRef.current) {
                    lastSpeechTimeRef.current = Date.now();
                } else if (hasSpokenRef.current) {
                    const silenceDuration = Date.now() - lastSpeechTimeRef.current;
                    const hasMoreTopics = isDynamicTask && dynamicIndex < dynamicArray.length - 1;
                    
                    // Check for Timer Freeze (Triggered at 3s)
                    if (!disableTimerFreeze && silenceDuration >= VAD_CONFIG.silenceFreezeMs) {
                        setIsSilentPause(true); // Freezes the clock immediately
                    }

                    // Check for Topic Switch (Triggered at 5s, Dynamic Tasks only)
                    if (hasMoreTopics && silenceDuration >= VAD_CONFIG.topicPromptDelayMs && !promptTopicSwitch) {
                        setPromptTopicSwitch(true); // Show the prompt overlay
                        pauseRecording();           // Stop the clock and audio instantly
                        lastSpeechTimeRef.current = Date.now(); // Reset silence clock
                    }

                    // Check for Early Stop (Triggered at 10s on static tasks or final topic)
                    if (!hasMoreTopics && silenceDuration >= VAD_CONFIG.earlyStopMs) {
                        setCanEarlyStop(true);
                    }
                }
            }
        }, 500); 

        return () => clearInterval(interval);
    }, [activeUseVAD, isDynamicTask, dynamicArray.length, dynamicIndex, RECORDING_STATES.RECORDING, awaitingNextTopic, promptTopicSwitch]);

    // Initialize the VAD AI Model
    useEffect(() => {
        if (!activeUseVAD || !stream) return;

        let frameCount = 0;

        const initVAD = async () => {
            if (!window.vad) {
                logToServer("VAD script missing in index.html");
                return;
            }

            if (isInitializingVad.current) {
                logToServer("VAD is already initializing, skipping...");
                return; 
            }

            try {
                isInitializingVad.current = true;
                setIsVadLoaded(false);

                // Dynamically get the correct path (e.g., /test/dist/vad/)
                const basePath = `${import.meta.env.BASE_URL}vad/`;
                
                const activeVadConfig = { ...VAD_CONFIG, ...vadConfigOverride };

                // Instantiate the local model
                vadInstance.current = await window.vad.MicVAD.new({
                    stream: stream, 
                    onnxWASMBasePath: basePath,
                    baseAssetPath: basePath,
                    workletURL: basePath + "vad.worklet.bundle.min.js",
                    modelURL: basePath + "silero_vad_v5.onnx",
                    ortConfig: (ort) => {
                        ort.env.wasm.simd = false;
                        ort.env.wasm.numThreads = 1;
                        ort.env.wasm.wasmPaths = basePath;
                    },
                    // TUNED PARAMETERS FOR LONG SPEECH (https://docs.vad.ricky0123.com/user-guide/algorithm/#configuration)
                    positiveSpeechThreshold: activeVadConfig.positiveSpeechThreshold, 
                    negativeSpeechThreshold: activeVadConfig.negativeSpeechThreshold,
                    redemptionMs: activeVadConfig.redemptionMs,
                    preSpeechPadMs: activeVadConfig.preSpeechPadMs,
                    minSpeechMs: activeVadConfig.minSpeechMs,
                    
                    onFrameProcessed: (probs) => { 
                        setSpeechProb(probs.isSpeech); 
                        // Log the first 3 frames to prove the AudioContext is running
                        // and see what probability scores the mic is generating
                        if (frameCount < 3) {
                            logToServer(`VAD Frame Processed [${frameCount}]`, { probability: probs.isSpeech });
                            frameCount++;
                        }
                    },
                    onSpeechStart: () => {
                        isSpeakingRef.current = true;
                        hasSpokenRef.current = true;
                        setIsSpeaking(true);
                        setHasSpoken(true);
                        setIsSilentPause(false); 
                        setCanEarlyStop(false);
                        lastSpeechTimeRef.current = Date.now(); 

                        if (statusRef.current === RECORDING_STATES.RECORDING) {
                            currentSpeechStart.current = Date.now();
                        }
                        
                        // Trigger parent callback
                        if (onVadSpeechStart) onVadSpeechStart();
                    },
                    onVADMisfire: () => {
                        isSpeakingRef.current = false;
                        setIsSpeaking(false);
                        setIsSilentPause(false);
                        setCanEarlyStop(false);
                        lastSpeechTimeRef.current = Date.now(); 
                    },
                    onSpeechEnd: () => {
                        isSpeakingRef.current = false;
                        setIsSpeaking(false);
                        lastSpeechTimeRef.current = Date.now(); 

                        if (statusRef.current === RECORDING_STATES.RECORDING && currentSpeechStart.current) {
                            speechSegments.current.push({
                                startTime: currentSpeechStart.current,
                                endTime: Date.now(),
                                durationMs: Date.now() - currentSpeechStart.current
                            });
                            currentSpeechStart.current = null; 
                        }

                        // Trigger parent callback
                        if (onVadSpeechEnd) onVadSpeechEnd();
                    },
                });

                setIsVadLoaded(true);

                // If user clicked record while the AI was still loading, start it immediately
                if (statusRef.current === RECORDING_STATES.RECORDING) {
                    vadInstance.current.start();
                }
            } catch (error) {
                console.error("Failed to load VAD model:", error);
                logToServer("Failed to load VAD model", { ...getBrowserInfo(), error: error.message || error.toString() });
                isInitializingVad.current = false;
                setVadFailed(true);     // Mark VAD as failed
                setIsVadLoaded(true);   // Pretend it loaded so the UI 'Start' button unlocks
            }
        };

        const vadInitTimer = setTimeout(() => {
            initVAD();
        }, 500);

        // Cleanup: pause and destroy the AI when leaving the page
        return () => {
            clearTimeout(vadInitTimer);
            if (vadInstance.current) {
                vadInstance.current.pause();
                vadInstance.current = null;
            }
        };
    }, [activeUseVAD, stream, RECORDING_STATES.RECORDING]);

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
        if (!activeUseVAD || !vadInstance.current) return;
        if (recordingStatus === RECORDING_STATES.RECORDING) {
            vadInstance.current.start();
            setIsSilentPause(false);
            setCanEarlyStop(false);
        } else {
            vadInstance.current.pause();
            setIsSilentPause(false);
            setCanEarlyStop(false);
        }
    }, [recordingStatus, activeUseVAD, RECORDING_STATES.RECORDING]);

    const resetSpeechTrackers = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        hasSpokenRef.current = false;
        setHasSpoken(false); 
        setIsSilentPause(false);
        setCanEarlyStop(false);
        setSpeechProb(0);
        lastSpeechTimeRef.current = Date.now(); 
    };

    // --- Wrappers ---
    const handleStart = () => {
        onLogEvent("button_start");
        recordingStartTimeRef.current = Date.now();
        resetSpeechTrackers();
        
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
        // Reset dynamic task UI states
        setDynamicIndex(0);
        setAwaitingNextTopic(false); 
        setPromptTopicSwitch(false);
        // Reset data containers
        speechSegments.current = []; 
        currentSpeechStart.current = null;
        
        resetSpeechTrackers(); // Clean VAD start
        repeatRecording();

        // Send user back to SETUP phase if video is enabled
        if (isVideoEnabled) {
            setPhase('SETUP');
        }
    };

    // We pass the logger to the example button so it can log clicks itself
    const handleToggleExample = () => {
        if (voiceRecorder.exampleAudio) {
            voiceRecorder.stopExample(); 
        } else {
            onLogEvent("button_illustration"); playExample(); 
        }
    };

    // --- Topic Switching Logic ---
    const handleAcceptTopicSwitch = () => {
        onLogEvent("topic_switch_accepted");
        setDynamicIndex(prev => prev + 1); 
        setPromptTopicSwitch(false);
        setAwaitingNextTopic(true); // Tells UI to show the "Start" state again
        resetSpeechTrackers();
    };

    const handleDeclineTopicSwitch = () => {
        onLogEvent("topic_switch_declined");
        setPromptTopicSwitch(false);
        // We only want to clear the pause state and give them a fresh 9.5s, 
        // but we want the app to remember they have already spoken for this topic.
        setIsSilentPause(false);
        lastSpeechTimeRef.current = Date.now();
        resumeRecording(); 
    };

    const handleStartNextTopic = () => {
        onLogEvent("start_next_topic");
        setAwaitingNextTopic(false);
        resetSpeechTrackers(); // Clean VAD start before unpausing
        resumeRecording(); // Starts the clock and audio again
    };

    // Listen for the prompt state and fire the ConfirmDialog
    useEffect(() => {
        if (promptTopicSwitch) {
            confirm({
                title: "Ready for the next topic?",
                message: "We noticed a pause. Would you like to switch to the next topic?",
                confirmText: "Yes, switch",
                cancelText: "No, continue"
            }).then((isConfirmed) => {
                if (isConfirmed) {
                    handleAcceptTopicSwitch();
                } else {
                    handleDeclineTopicSwitch();
                }
            });
        }
    }, [promptTopicSwitch]);


    // Auto-request permission on mount if enabled
    React.useEffect(() => {
        if (autoPermission) {
            if (isVideoEnabled) {
                videoRecorder.getMediaPermission().then(() => {
                    // Sync the audio hook's permission state as well
                    getMicrophonePermission(); 
                }); 
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
            setExampleExists(res.ok && (res.headers.get("content-type") || "").includes("audio"));
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
            recordingStartTime: recordingStartTimeRef.current,
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

    // Automatically submit if the recording is finished and autoSubmit is enabled
    useEffect(() => {
        if (autoSubmit && recordingStatus === RECORDING_STATES.RECORDED && audioURL) {
            handleNextTask();
        }
    }, [recordingStatus, autoSubmit, audioURL]); 

    // Start Video Calibration
    const handleStartCalibration = async () => {
        const hasPermission = await videoRecorder.getMediaPermission();
        if (hasPermission) {
            await getMicrophonePermission();
            setPhase('CALIBRATE');
            videoRecorder.startFaceDetection();
        } else {
            console.error("Camera/Mic permission denied or failed.");
        }
    };

    // --- Prepare UI Strings (Simplified) ---
    const isCalibrationPhase = isVideoEnabled && (phase === 'SETUP' || phase === 'CALIBRATE');
    
    // Choose which base instructions to show
    let baseInstructions = instructions;
    if (isCalibrationPhase) {
        baseInstructions = "To ensure accurate results, please rest your arm on a table to hold the phone completely steady. Follow instructions during the calibration and try to position your face within the frame. <strong>It is very important</strong> that you do not move the phone once the calibration is complete.";
    } else if (recordingStatus === RECORDING_STATES.RECORDED) {
        // Show completion instructions when the task is finished
        baseInstructions = completedInstructions;
    } else if (instructionsActive && recordingStatus !== RECORDING_STATES.IDLE && !awaitingNextTopic) {
        // If recording and NOT waiting for the user to start a new topic, show active instructions
        baseInstructions = voiceRecorder.activeInstructions || instructionsActive;
    }
    
    let rawInstructions = baseInstructions;

    // Apply interpolation universally
    if (isDynamicTask && typeof rawInstructions === 'string') {
        const currentItem = dynamicArray[dynamicIndex];
        const paramKey = Object.keys(taskParams).find(k => taskParams[k] === dynamicArray) || "topic";
        
        if (typeof currentItem === 'string') {
            rawInstructions = rawInstructions.replace(new RegExp(`{{${paramKey}}}`, 'g'), currentItem);
        } else if (typeof currentItem === 'object' && currentItem !== null) {
            Object.entries(currentItem).forEach(([key, value]) => {
                rawInstructions = rawInstructions.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
            });
        }
    }

    const slots = {
        example: exampleExists ? <div className="instruction-example-row"><AudioExampleButton recordingStatus={recordingStatus} audioExample={audioExample} isPlaying={!!voiceRecorder.exampleAudio} onToggle={handleToggleExample} variant="example"/></div> : null,
        playStory: exampleExists ? <div className="instruction-example-row"><AudioExampleButton recordingStatus={recordingStatus} audioExample={audioExample} isPlaying={!!voiceRecorder.exampleAudio} onToggle={handleToggleExample} variant="story"/></div> : null
    };

    let vadVisualState = "idle";
    let vadStatusText = "";
    if (activeUseVAD && recordingStatus === RECORDING_STATES.RECORDING) {
        if (!hasSpoken) vadVisualState = "waiting";
        else if (showSilenceWarning) {
            vadVisualState = "warning";
            vadStatusText = canEarlyStop ? "If you have nothing more to say, you can click Stop to finish." : "If possible, try to speak a little longer.";
        } else if (isSpeaking) vadVisualState = "speaking";
    }

    return (
        <div className={`task-container ${className} vad-${vadVisualState} status-${recordingStatus.toLowerCase()}`}>

            {/* Incompatible browser overlay */}
            {incompatibleBrowser && (
                <IncompatibleBrowser browserName={incompatibleBrowser} />
            )}

            <div className='task-header'>
                {!(hideTitle && recordingStatus === RECORDING_STATES.RECORDING) && (
                    <>
                        <h1>{isCalibrationPhase ? "📷 Camera Setup" : title}</h1>
                        <div className="flexible-spacer"></div>
                    </>
                )}
                
                <div
                    key={isCalibrationPhase ? 'calibration' : (isDynamicTask ? dynamicIndex : 'static')} 
                    className={`instruction-card active-instructions ${!(hideTitle && recordingStatus === RECORDING_STATES.RECORDING) ? 'with-title' : 'no-title'}`}
                >
                    <FormattedText text={rawInstructions} slots={slots} />
                </div>
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
                    <div className={`recording-area ${recordingStatus === RECORDING_STATES.RECORDED ? 'is-recorded' : ''}`}>
                    
                    {recordingStatus !== RECORDING_STATES.RECORDED && recordingStatus !== RECORDING_STATES.IDLE && !promptTopicSwitch && !awaitingNextTopic && (
                        <>
                            <RecordingTimer
                                time={recordingTime}
                                remainingTime={voiceRecorder.remainingTime}
                                status={recordingStatus}
                                audioLevels={audioLevels}
                                showVisualizer={showVisualizer}
                                isReadyToStop={isReadyToStop}
                                mode={mode}
                                showMicIcon={showMicIcon !== undefined ? showMicIcon : (mode === 'countDown')}
                            >
                            </RecordingTimer>

                            {/* VAD Probability Debug Bar */}
                            {activeUseVAD && recordingStatus === RECORDING_STATES.RECORDING && DEBUG_MODE && (
                                <div style={{ marginTop: '15px', fontSize: '0.85rem', color: '#666', textAlign: 'center', fontFamily: 'monospace' }}>
                                    <div>Speech Probability: {(speechProb * 100).toFixed(1)}%</div>
                                    <div style={{ width: '200px', height: '6px', background: '#e0e0e0', borderRadius: '3px', margin: '6px auto', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(speechProb * 100, 100)}%`, height: '100%', background: speechProb >= 0.5 ? '#4caf50' : '#9e9e9e', transition: 'width 0.1s linear, background 0.1s' }} />
                                    </div>
                                </div>
                            )}

                            {activeUseVAD && vadStatusText && (
                                <div className="vad-status-wrapper">
                                    <div className={`vad-status-pill vad-pill-${vadVisualState}`}>
                                        {vadVisualState === 'waiting' && <span className="vad-icon"></span>}
                                        {vadVisualState === 'warning' && <span className="vad-icon"></span>}
                                        <span>{vadStatusText}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    </div>
                    
                    {DEBUG_MODE &&
                        <StatusIndicator status={recordingStatus} />
                    }

                    {activeUseVAD && !isVadLoaded && stream && (
                        <div className="vad-loading-indicator" style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>
                            Loading Speech Detector...
                        </div>
                    )}
                    

                    {awaitingNextTopic ? (
                        <div className="bottom-controls">
                            <button className="btn-primary" onClick={handleStartNextTopic}>
                                Start Next Topic
                            </button>
                        </div>
                    ) : (
                        <div className="bottom-controls" style={{ visibility: promptTopicSwitch ? 'hidden' : 'visible' }}>
                            <RecordingControls
                                recordingStatus={recordingStatus}
                                disableControls={mode === 'countDown'}
                                disableStart={activeUseVAD && !isVadLoaded}
                                permission={audioPermission}
                                onStart={handleStart}
                                onPause={pauseRecording}
                                onResume={resumeRecording}
                                onStop={handleStop}
                                onPermission={getMicrophonePermission}
                                disableStop={!isReadyToStop}
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
                    )}
                </>
            )}
        </div>
    );
};