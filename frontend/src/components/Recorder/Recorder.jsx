import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import { useVadLogic } from '../../hooks/useVADLogic';
import './Recorder.css';
import { RecordingTimer } from './RecordingTimer';
import { StatusIndicator } from './StatusIndicator';
import { RecordingControls } from './RecordingControls';
import { PlaybackSection } from './PlaybackSection';
import { AudioExampleButton } from './AudioExampleButton';
import { VideoViewfinder } from './VideoViewfinder';
import FormattedText from "../FormattedText/FormattedText";
import { useConfirm } from '../ConfirmDialog/ConfirmDialogContext';
import { logToServer } from '../../utils/frontendLogger';
import { interpolateInstructions } from '../../utils/instructionParser';
import { IncompatibleBrowser } from './IncompatibleBrowser';

const DEBUG_MODE = false; //import.meta.env.VITE_DEBUG_MODE === 'true';


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

    // --- Dynamic Task Detection ---
    const dynamicArrayParam = Object.values(taskParams).find(val => Array.isArray(val));
    const dynamicArray = Array.isArray(dynamicArrayParam) ? dynamicArrayParam : [];
    const isDynamicTask = dynamicArray.length > 0

    const [dynamicIndex, setDynamicIndex] = useState(0);
    const [promptTopicSwitch, setPromptTopicSwitch] = useState(false);
    const [awaitingNextTopic, setAwaitingNextTopic] = useState(false);
    const [topicStartMark, setTopicStartMark] = useState(0);
    const [isTimerActive, setIsTimerActive] = useState(forceTimerActive || !useVAD);

    const confirm = useConfirm();

    // Extract minimal duration and forced maximal duration from the parameters set by the Admin
    const { minDuration, maxDuration } = taskParams;


    // --- Video Recorder Hook ---
    const videoRecorder = useVideoRecorder({
        debugMode: DEBUG_MODE,
        onRecordingComplete: (videoData) => {
            logToServer("Video data processed!", videoData);
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
        isTimerActive
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

    // --- VAD Logic Hook --- 
    const VADmodel = useVadLogic({
        useVAD,
        vadConfigOverride,
        stream,                            
        audioContext: voiceRecorder.audioContext, 
        recordingStatus,                   
        RECORDING_STATES,                  
        pauseRecording,                    
        resumeRecording,                   
        onVadSpeechStart,
        onVadSpeechEnd,
        isDynamicTask,
        dynamicArray,
        dynamicIndex,
        awaitingNextTopic,
        promptTopicSwitch,
        setPromptTopicSwitch,
        disableTimerFreeze
    });

    const { 
        isVadLoaded, vadFailed, activeUseVAD, isSpeaking, isSilentPause, 
        canEarlyStop, hasSpoken, speechProb, speechSegments, 
        resetSpeechTrackers, resetSilenceClock, clearSilenceState, clearSpeechSegments
    } = VADmodel;

    // Update the Timer State whenever VAD state changes
    useEffect(() => {
        const timerShouldRun = forceTimerActive || !activeUseVAD || (hasSpoken && (disableTimerFreeze || !isSilentPause));
        setIsTimerActive(timerShouldRun);
    }, [forceTimerActive, activeUseVAD, hasSpoken, disableTimerFreeze, isSilentPause]);

    // Calculate Stop Button & Warning Logic 
    const minimalDurationMs = minDuration || 0; // Default to 0 if not set
    const isMinimalReached = voiceRecorder.recordingTime >= minimalDurationMs;
    const isReadyToStop = (!(mode === 'countDown') && isMinimalReached) ||
                        canEarlyStop || 
                        mode === 'basicStop' ||
                        (isDynamicTask && dynamicIndex >= 2);
    const showSilenceWarning = VADmodel.isSilentPause && !suppressSilenceWarning &&  voiceRecorder.recordingTime <= duration;
    
    // Determine the visual "Semaphore" phase
    let visualPhase = 'orange';
    if (!isReadyToStop) {
        visualPhase = 'red';
    } else if (durationExpired || (mode === 'basicStop' && isMinimalReached)) {  
        visualPhase = 'green';
    } else if (isMinimalReached) {
        visualPhase = 'orange';
    }
   
    // Speech Metadata Trackers
    const recordingStartTimeRef = useRef(null);

    useEffect(() => {
        if (onRecordingStateChange) {
            onRecordingStateChange(recordingStatus === RECORDING_STATES.RECORDING);
        }
    }, [recordingStatus, onRecordingStateChange, RECORDING_STATES.RECORDING]);

    // Capture the current recording time whenever the topic index changes
    useEffect(() => {
        // If VAD failed, we need this bookmark to show the manual button at the right time
        setTopicStartMark(voiceRecorder.recordingTime);
        logToServer(`Topic index changed to ${dynamicIndex}, setting topic start mark at ${voiceRecorder.recordingTime} seconds`);
    }, [dynamicIndex]);


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

        clearSpeechSegments();
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
        clearSilenceState();
        resetSilenceClock();
        resumeRecording(); 
    };

    const handleStartNextTopic = () => {
        onLogEvent("start_next_topic");
        setAwaitingNextTopic(false);
        resetSpeechTrackers();
        resumeRecording(); // Starts the clock and audio again
    };

    const handleManualTopicSwitch = () => {
        onLogEvent("topic_switch_manual_triggered");
        pauseRecording();           // This freezes the timer and audio buffer
        setPromptTopicSwitch(true); // This triggers the Confirm Dialog
    };

    // --- Manual Fallback Logic ---
    // Show manual switch if: It's dynamic, we are recording, and user has talked for 30s 
    // (or if VAD specifically failed)
    const manualSwitchThresholdS = 20; 
    const currentTopicDuration = voiceRecorder.recordingTime - topicStartMark;
    const canShowManualSwitch = isDynamicTask && 
        recordingStatus === RECORDING_STATES.RECORDING && 
        currentTopicDuration >= manualSwitchThresholdS &&
        vadFailed;

    // Listen for the prompt state and fire the ConfirmDialog
    useEffect(() => {
        if (promptTopicSwitch) {
            confirm({
                title: "Another topic is available",
                message: "Would you like to switch to the next topic?",
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
        logToServer("Saving Task Data:", taskData);
        
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
    
    // --- Instruction Parsing & Interpolation ---
    const parsedInstructions = useMemo(() => {
        let baseInstructions = instructions;

        // Determine which text to show based on the current phase
        if (isCalibrationPhase) {
            baseInstructions = "To ensure accurate results, please rest your arm on a table to hold the phone completely steady. Follow instructions during the calibration and try to position your face within the frame. <strong>It is very important</strong> that you do not move the phone once the calibration is complete.";
        } else if (isDynamicTask && dynamicIndex > 0) {
            baseInstructions = voiceRecorder.activeInstructions || instructionsActive || instructions;
        } else if (recordingStatus === RECORDING_STATES.RECORDED) {
            baseInstructions = completedInstructions;
        } else if (instructionsActive && recordingStatus !== RECORDING_STATES.IDLE && !awaitingNextTopic) {
            baseInstructions = voiceRecorder.activeInstructions || instructionsActive;
        }

        // Interpolate dynamic variables (e.g. {{topic}}) into the text
        const currentItem = isDynamicTask ? dynamicArray[dynamicIndex] : null;
        return interpolateInstructions(baseInstructions, isDynamicTask, currentItem, taskParams, dynamicArray);

    }, [
        instructions, 
        instructionsActive, 
        completedInstructions, 
        isCalibrationPhase, 
        isDynamicTask, 
        dynamicIndex, 
        recordingStatus, 
        awaitingNextTopic, 
        voiceRecorder.activeInstructions, 
        dynamicArray, 
        taskParams, 
        RECORDING_STATES
    ]);

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

    // 1. Detect if we are in the Reading Task (hideTitle is true) AND currently recording
    const shouldShiftTimer = hideTitle && recordingStatus === RECORDING_STATES.RECORDING;

    // 2. Wrap the entire recording-area into a clean reusable render function
    const renderRecordingArea = () => (
        <div className={`recording-area 
            ${recordingStatus === RECORDING_STATES.RECORDED ? 'is-recorded' : ''}
            ${shouldShiftTimer ? 'is-shifted' : ''}`}
        >
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
                        visualPhase={visualPhase}
                    />

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
    );

    return (
        <div className={`task-container ${className} vad-${vadVisualState} status-${recordingStatus.toLowerCase()}`}>

            {/* Incompatible browser overlay */}
            {incompatibleBrowser && (
                <IncompatibleBrowser browserName={incompatibleBrowser} />
            )}

            {shouldShiftTimer && phase === 'RECORDING' && renderRecordingArea()}

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
                    <FormattedText text={parsedInstructions} slots={slots} />
                    {/* Manual Fallback Button */}
                    {canShowManualSwitch && !promptTopicSwitch && !awaitingNextTopic && (
                        <button 
                            className="btn-manual-switch"
                            onClick={handleManualTopicSwitch}
                        >
                            Switch Topic
                        </button>
                    )}
                </div>
            </div>
            
            {isVideoEnabled && (
                <VideoViewfinder 
                    phase={phase} 
                    videoRecorder={videoRecorder} 
                    isRecording={recordingStatus === RECORDING_STATES.RECORDING} 
                />
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
                    {!shouldShiftTimer && renderRecordingArea()}
                    
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