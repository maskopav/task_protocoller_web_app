import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import { useVadLogic } from '../../hooks/useVADLogic';
import { useTaskTopics } from '../../hooks/useTaskTopics';
import './Recorder.css';
import checkIcon from '../../assets/successIcons/checkmark-icon.svg';
import { RecordingTimer } from './RecordingTimer';
import { StatusIndicator } from './StatusIndicator';
import { RecordingControls } from './RecordingControls';
import { PlaybackSection } from './PlaybackSection';
import { AudioExampleButton } from './AudioExampleButton';
import { VideoViewFinder } from './VideoViewFinder.jsx';
import FormattedText from "../FormattedText/FormattedText";
import { useConfirm } from '../ConfirmDialog/ConfirmDialogContext';
import { logToServer } from '../../utils/frontendLogger';
import { interpolateInstructions } from '../../utils/instructionParser';
import { IncompatibleBrowser } from './IncompatibleBrowser';
import TaskLayout from '../TaskLayout/TaskLayout';

const DEBUG_MODE = false;

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
    onAudioEvent = () => {},
    autoSubmit = false,
    onPermissionPending = () => {}
}) => {
    // ── Phase state ──────────────────────────────────────────────────────
    const isVideoEnabled = String(recordVideo) === 'true';
    // Always start at RECORDING so task instructions + Start button are shown first.
    // For video tasks, calibration is triggered by the Start button, not on mount.
    const [phase, setPhase] = useState('RECORDING');
    // Tracks whether the user has completed calibration at least once this session.
    // Prevents the PiP viewfinder from appearing before calibration has happened.
    const [videoCalibrated, setVideoCalibrated] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const isUploadingRef = useRef(false);

    // ── Dynamic task detection ───────────────────────────────────────────
    const rawArrayParam = Object.values(taskParams).find(val => Array.isArray(val));
    const dynamicArray  = Array.isArray(rawArrayParam)
        ? rawArrayParam.filter(item => item !== null && item !== undefined && item !== '')
        : [];
    const isDynamicTask = dynamicArray.length > 0;

    useEffect(() => {
        if (isDynamicTask) {
            logToServer(`Recorder initialized with dynamic task: ${isDynamicTask}, true array length: ${dynamicArray.length}, raw array: ${JSON.stringify(rawArrayParam)}`);
        }
    }, [isDynamicTask, dynamicArray.length]);

    // ── Timer state (for VAD-controlled timing) ──────────────────────────
    const [isTimerActive, setIsTimerActive] = useState(forceTimerActive || !useVAD);

    const { minDuration, maxDuration } = taskParams;

    // ── Video recorder hook ──────────────────────────────────────────────
    const videoRecorder = useVideoRecorder({
        debugMode: DEBUG_MODE,
        onRecordingComplete: (videoData) => {
            logToServer("Video data processed!", { size: videoData?.size, duration: videoData?.duration, type: videoData?.type })
        }
    });

    // ── Voice recorder hook ──────────────────────────────────────────────
    const voiceRecorder = useVoiceRecorder({
        onRecordingComplete, onError, instructions, instructionsActive,
        audioExample, mode, duration, maxDuration, isTimerActive
    });

    const {
        recordingStatus, permission: audioPermission, stream, audioURL, recordingTime,
        audioLevelsRef, activeInstructions, durationExpired, incompatibleBrowser,
        getMicrophonePermission, startRecording: startAudioRecording, pauseRecording,
        resumeRecording, stopRecording: stopAudioRecording, repeatRecording,
        playExample, stopExample, RECORDING_STATES
    } = voiceRecorder;

    // ── VAD bridge ───────────────────────────────────────────────────────
    const vadHelpersRef = useRef(null);

    const taskTopics = useTaskTopics({
        recordingTime:   voiceRecorder.recordingTime,
        pauseRecording:  voiceRecorder.pauseRecording,
        resumeRecording: voiceRecorder.resumeRecording,
        onLogEvent,
        onTopicAccepted:   () => vadHelpersRef.current?.resetSpeechTrackers(),
        onTopicDeclined:   () => {
            vadHelpersRef.current?.clearSilenceState();
            vadHelpersRef.current?.resetSilenceClock();
        },
        onStartNextTopic: () => vadHelpersRef.current?.resetSpeechTrackers()
    });

    const {
        dynamicIndex, promptTopicSwitch, setPromptTopicSwitch,
        awaitingNextTopic, topicStartMark, handleStartNextTopic,
        handleManualTopicSwitch, resetTopics
    } = taskTopics;

    const VADmodel = useVadLogic({
        useVAD, vadConfigOverride, stream,
        audioContext: voiceRecorder.audioContext,
        recordingStatus, RECORDING_STATES, pauseRecording, resumeRecording,
        onVadSpeechStart, onVadSpeechEnd,
        isDynamicTask, dynamicArray, dynamicIndex,
        awaitingNextTopic, promptTopicSwitch, setPromptTopicSwitch,
        disableTimerFreeze
    });

    const {
        isVadLoaded, vadFailed, activeUseVAD, isSpeaking, isSilentPause,
        canEarlyStop, hasSpoken, speechProb, speechSegments,
        resetSpeechTrackers, resetSilenceClock, clearSilenceState, clearSpeechSegments
    } = VADmodel;

    useEffect(() => { vadHelpersRef.current = VADmodel; }, [VADmodel]);

    useEffect(() => {
        const timerShouldRun = forceTimerActive || !activeUseVAD || (hasSpoken && (disableTimerFreeze || !isSilentPause));
        setIsTimerActive(timerShouldRun);
    }, [forceTimerActive, activeUseVAD, hasSpoken, disableTimerFreeze, isSilentPause]);

    // ── Stop / warning logic ─────────────────────────────────────────────
    const minimalDurationMs = minDuration || 0;
    const isMinimalReached  = voiceRecorder.recordingTime >= minimalDurationMs;
    const isReadyToStop     = (!(mode === 'countDown') && isMinimalReached) ||
                              canEarlyStop || mode === 'basicStop' ||
                              (isDynamicTask && dynamicIndex >= dynamicArray.length - 1);
    const showSilenceWarning = VADmodel.isSilentPause && !suppressSilenceWarning;

    let visualPhase = 'orange';
    if (!isReadyToStop) {
        visualPhase = 'red';
    } else if (durationExpired || (mode === 'basicStop' && isMinimalReached)) {
        visualPhase = 'green';
    } else if (isMinimalReached) {
        visualPhase = 'orange';
    }

    useEffect(() => {
        if (onRecordingStateChange) {
            onRecordingStateChange(recordingStatus === RECORDING_STATES.RECORDING);
        }
    }, [recordingStatus, onRecordingStateChange, RECORDING_STATES.RECORDING]);

    const prevStatusRef = useRef(recordingStatus);
    useEffect(() => {
        if (prevStatusRef.current !== recordingStatus) {
        if (recordingStatus === RECORDING_STATES.RECORDED) {
            onAudioEvent('completed');
        }
        prevStatusRef.current = recordingStatus;
        }
    }, [recordingStatus, RECORDING_STATES.RECORDED, onAudioEvent]);

    // ── Handlers ─────────────────────────────────────────────────────────
    const handleStart = () => {
        onLogEvent("button_start");
        resetSpeechTrackers();
        if (isVideoEnabled) {
            // Defer actual recording until calibration completes.
            // VideoViewFinder auto-triggers the setup instructions dialog on SETUP mount.
            setPhase('SETUP');
        } else {
            startAudioRecording();
        }
    };

    const handleStop = () => {
        onLogEvent("button_stop", { task_recording_duration: recordingTime });
        stopAudioRecording();
        if (isVideoEnabled) videoRecorder.stopRecording();
    };

    const handleRepeat = () => {
        onLogEvent("button_repeat");
        onAudioEvent('retry'); 
        resetTopics();
        clearSpeechSegments();
        resetSpeechTrackers();
        repeatRecording();
        if (isVideoEnabled) {
            // Always re-calibrate on repeat: stopRecording() kills face detection so any
            // live check would return stale values
            setVideoCalibrated(false);
            handleStartCalibration();
        }
    };

    const handleToggleExample = () => {
        if (voiceRecorder.exampleAudio) {
            onLogEvent("button_stop_example");
            voiceRecorder.stopExample();
        } else {
            onLogEvent("button_play_example");
            playExample();
        }
    };

    // ── Manual topic switch logic ─────────────────────────────────────────
    const manualSwitchThresholds = 20;
    const currentTopicDuration   = recordingTime - topicStartMark;
    const hasMoreTopics          = isDynamicTask && dynamicIndex < dynamicArray.length - 1;
    const canShowManualSwitch    = hasMoreTopics &&
        recordingStatus === RECORDING_STATES.RECORDING &&
        ((currentTopicDuration >= manualSwitchThresholds && vadFailed) || VADmodel.isSilentPause);

    // ── Auto-permissions ──────────────────────────────────────────────────
    // The native permission dialog appears synchronously the moment
    // getUserMedia() is called and stays up until the user responds — there's
    // no way to detect it directly. So instead of trying to detect it, we
    // signal "about to request" beforehand (letting the parent pause/hide the
    // audio guide the same way it already does for isRecordingActive) and
    // clear the signal once the promise settles, regardless of outcome.
    React.useEffect(() => {
        if (autoPermission) {
            onPermissionPending(true);
            if (isVideoEnabled) {
                videoRecorder.getMediaPermission()
                    .then(() => getMicrophonePermission())
                    .finally(() => onPermissionPending(false));
            } else {
                getMicrophonePermission()
                    .finally(() => onPermissionPending(false));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const handleNextTask = async () => {
        if (!onNextTask || isUploadingRef.current) return;
        isUploadingRef.current = true;
        setIsUploading(true);
        const taskData = {
            audioURL, recordingTime,
            timestamp:          new Date().toISOString(),
            recordingStartTime: voiceRecorder.firstChunkTimeRef.current,
            taskTitle:          title,
            taskType:           'voice',
            speechSegments:     speechSegments.current,
            ...(isVideoEnabled && videoRecorder.videoData && { videoData: videoRecorder.videoData })
        };
        try {
            await onNextTask(taskData); // must return a Promise (handleTaskComplete already does)
        } catch (err) {
            // if you want the button to become clickable again after a failure, reset here
            isUploadingRef.current = false;
            setIsUploading(false);
            throw err;
        }
    };

    useEffect(() => {
        if (autoSubmit && recordingStatus === RECORDING_STATES.RECORDED && audioURL) {
            handleNextTask();
        }
    }, [recordingStatus, autoSubmit, audioURL]);

    const handleStartCalibration = async () => {
        setPhase('CALIBRATE');
        const hasPermission = await videoRecorder.getMediaPermission();
        if (hasPermission) {
            await getMicrophonePermission();
            videoRecorder.startFaceDetection();
        } else {
            setPhase('SETUP');
            console.error("Camera/Mic permission denied or failed.");
        }
    };

    // Finish Video Calibration (Passed to VideoViewFinder)
    // This is the real "start" for video tasks — both recorders kick off here.
    const handleFinishCalibration = () => {
        setVideoCalibrated(true);
        setPhase('RECORDING');
        startAudioRecording();
        videoRecorder.startRecording();
    };

    // ── Instruction parsing ───────────────────────────────────────────────
    const isCalibrationPhase = isVideoEnabled && (phase === 'SETUP' || phase === 'CALIBRATE');

    const parsedInstructions = useMemo(() => {
        let baseInstructions = instructions;

        if (isCalibrationPhase) {
            baseInstructions = "To ensure accurate results, please rest your arm on a table to hold the phone completely steady. Follow instructions during the calibration and try to position your face within the frame. <strong>It is very important</strong> that you do not move the phone once the calibration is complete.";
        } else if (recordingStatus === RECORDING_STATES.RECORDED) {
            baseInstructions = completedInstructions;
        } else if (isDynamicTask && dynamicIndex > 0) {
            baseInstructions = voiceRecorder.activeInstructions || instructionsActive || instructions;
        } else if (instructionsActive && recordingStatus !== RECORDING_STATES.IDLE && !awaitingNextTopic) {
            baseInstructions = voiceRecorder.activeInstructions || instructionsActive;
        }

        const currentItem = isDynamicTask ? dynamicArray[dynamicIndex] : null;
        return interpolateInstructions(baseInstructions, isDynamicTask, currentItem, taskParams, dynamicArray);
    }, [
        instructions, instructionsActive, completedInstructions, isCalibrationPhase,
        isDynamicTask, dynamicIndex, recordingStatus, awaitingNextTopic,
        voiceRecorder.activeInstructions, dynamicArray, taskParams, RECORDING_STATES
    ]);

    const exampleExists_ = exampleExists;
    const slots = {
        example:   exampleExists_ ? <div className="instruction-example-row"><AudioExampleButton recordingStatus={recordingStatus} audioExample={audioExample} isPlaying={!!voiceRecorder.exampleAudio} onToggle={handleToggleExample} variant="example"  /></div> : null,
        playStory: exampleExists_ ? <div className="instruction-example-row"><AudioExampleButton recordingStatus={recordingStatus} audioExample={audioExample} isPlaying={!!voiceRecorder.exampleAudio} onToggle={handleToggleExample} variant="story"   /></div> : null,
    };

    // ── VAD visual state ──────────────────────────────────────────────────
    let vadVisualState = "idle";
    let vadStatusText  = "";
    if (activeUseVAD && recordingStatus === RECORDING_STATES.RECORDING) {
        if (!hasSpoken) vadVisualState = "waiting";
        else if (showSilenceWarning) {
            vadVisualState = "warning";
            vadStatusText  = durationExpired
                ? "If you have nothing more to say, you can click Stop to finish."
                : "If possible, try to speak a little longer.";
        } else if (isSpeaking) vadVisualState = "speaking";
    }

    // ── Shifted-timer logic ───────────────────────────────────────────────
    // When hideTitle=true AND recording, the timer moves ABOVE the header so
    // the instruction card (the reading text) fills the centre of the screen.
    const shouldShiftTimer = hideTitle && recordingStatus === RECORDING_STATES.RECORDING;
    const isActivelyRecording = recordingStatus === RECORDING_STATES.RECORDING;

    // ── Inner timer / VAD content (no wrapper div — TaskLayout provides it) ──
    const timerContent = (
        recordingStatus !== RECORDING_STATES.RECORDED &&
        recordingStatus !== RECORDING_STATES.IDLE &&
        !promptTopicSwitch &&
        !awaitingNextTopic
    ) ? (
        <>
            <RecordingTimer
                time={recordingTime}
                remainingTime={voiceRecorder.remainingTime}
                status={recordingStatus}
                audioLevelsRef={audioLevelsRef}
                showVisualizer={showVisualizer}
                isReadyToStop={isReadyToStop}
                mode={mode}
                showMicIcon={showMicIcon !== undefined ? showMicIcon : (mode === 'countDown')}
                visualPhase={visualPhase}
            />

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
    ) : null;

    // ── Slot content ──────────────────────────────────────────────────────

    // preHeader: browser overlay + shifted timer (reading-task special case)
    const preHeaderContent = (
        <>
            {incompatibleBrowser && <IncompatibleBrowser browserName={incompatibleBrowser} />}

            {shouldShiftTimer && phase === 'RECORDING' && (
                <div className="recording-area is-shifted">
                    {timerContent}
                </div>
            )}
        </>
    );

    // instructions slot: instruction card content
    const instructionsContent = !isCalibrationPhase ? (
        <>
            {/* Show the green check icon ONLY when the recording is fully completed */}
            {recordingStatus === RECORDING_STATES.RECORDED && (
                <div
                    className="success-icon-mask"
                    style={{ '--icon-url': `url("${checkIcon}")` }}
                    aria-hidden="true"
                />
            )}

            <FormattedText text={parsedInstructions} slots={slots} />

            {canShowManualSwitch && !promptTopicSwitch && !awaitingNextTopic && (
                <button className="btn-manual-switch" onClick={handleManualTopicSwitch}>
                    Switch Topic
                </button>
            )}
        </>
    ) : null;

    // main slot: video viewfinder (setup/calibrate) OR live timer (recording, non-shifted)
    const mainContent = (
        <>
            {/* VideoViewfinder:
                  SETUP / CALIBRATE  → full-screen calibration UI
                  RECORDING + videoCalibrated → PiP overlay during the task
                  RECORDING + !videoCalibrated → hidden (task instructions + Start button shown instead) */}
            {isVideoEnabled && (
                (phase === 'SETUP' || phase === 'CALIBRATE' ||
                (phase === 'RECORDING' && videoCalibrated)) ? (
                    <VideoViewFinder
                        phase={phase} 
                        videoRecorder={videoRecorder} 
                        isRecording={recordingStatus === RECORDING_STATES.RECORDING} 
                        onStartCalibration={handleStartCalibration}
                        onFinishCalibration={handleFinishCalibration}
                    />
                ) : null
            )}

            {/* Recording timer — only in RECORDING phase when not shifted above header */}
            {phase === 'RECORDING' && !shouldShiftTimer && timerContent}
        </>
    );

    // controls slot: VAD loading notice + record controls + playback
    const controlsContent = phase === 'RECORDING' ? (
        <>
            {DEBUG_MODE && <StatusIndicator status={recordingStatus} />}

            {activeUseVAD && !isVadLoaded && stream && (
                <div className="vad-loading-indicator" style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>
                    Loading Speech Detector...
                </div>
            )}

            {awaitingNextTopic ? (
                <button className="btn-primary" onClick={handleStartNextTopic}>
                    Start Next Topic
                </button>
            ) : (
                // display:contents makes this wrapper transparent to the flex layout while
                // still propagating visibility:hidden to all children when topic-switching
                <div style={{ display: 'contents', visibility: promptTopicSwitch ? 'hidden' : 'visible' }}>
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
                        isVideoEnabled={isVideoEnabled}
                    />
                    <PlaybackSection
                        audioURL={audioURL}
                        recordingStatus={recordingStatus}
                        onRepeat={handleRepeat}
                        onNextTask={handleNextTask}
                        showNextButton={showNextButton}
                        isUploading={isUploading}
                        onLogEvent={onLogEvent}
                    />
                </div>
            )}
        </>
    ) : null;

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <TaskLayout
            className={`${className} vad-${vadVisualState} status-${recordingStatus.toLowerCase()}`}

            preHeader={preHeaderContent}
            title={title}

            showSpacer={!(hideTitle && isActivelyRecording)}
            instructions={instructionsContent}
            instructionsKey={isDynamicTask ? dynamicIndex : 'static'}
            instructionsClassName={`${!(hideTitle && isActivelyRecording) ? 'with-title' : 'no-title'} ${shouldShiftTimer ? 'is-shifted-instructions' : ''}`}

            mainClassName={recordingStatus === RECORDING_STATES.RECORDED ? 'is-recorded' : ''}

            controls={controlsContent}
        >
            {mainContent}
        </TaskLayout>
    );
};
