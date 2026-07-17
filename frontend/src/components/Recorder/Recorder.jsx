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
import { AudioExamplePlayer } from './AudioExamplePlayer';
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
    onPermissionPending = () => {},
    onTopicChange = () => {},
    onPhaseChange,
    onCameraPermissionDenied = () => {},
    onDeclineVideo = null,
    autoPlayStoryTrigger = 0,
    onBeforeRecordingStart = () => {},
    onExamplePlay = () => {}
}) => {
    // ── Phase state ──────────────────────────────────────────────────────
    const isVideoEnabled = String(recordVideo) === 'true';
    // Always start at RECORDING so task instructions + Start button are shown first.
    // For video tasks, calibration is triggered by the Start button, not on mount.
    const [phase, setPhase] = useState(isVideoEnabled ? 'PERMISSION' : 'RECORDING');
    // Tracks whether the user has completed calibration at least once this session.
    // Prevents the PiP viewfinder from appearing before calibration has happened.
    const [videoCalibrated, setVideoCalibrated] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const isUploadingRef = useRef(false);
    const RECORDING_START_DELAY_MS = 1500;
    const [isPreparingToRecord, setIsPreparingToRecord] = useState(false);
    const recordingStartTimeoutRef = useRef(null);
    // Imperative handles to the story/example clips (owned locally here,
    // unlike the header guides which live in the parent) so they too can be
    // silenced synchronously the instant Start is clicked.
    const examplePlayerRef = useRef(null);
    const storyPlayerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (recordingStartTimeoutRef.current) {
                clearTimeout(recordingStartTimeoutRef.current);
            }
        };
    }, []);

    // Broadcast phase changes up to ParticipantInterfacePage
    useEffect(() => {
        if (onPhaseChange) {
            onPhaseChange(phase);
        }
    }, [phase, onPhaseChange]);

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
        RECORDING_STATES
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

    // Let the parent know which topic is active (index + value) so it can play
    // a matching per-topic audio guide. Always fires (even with null for
    // non-dynamic tasks) so the parent's topic state is never stale/ambiguous -
    // it must be the single source of truth here, not something the parent
    // also resets on its own, or the two updates race each other.
    useEffect(() => {
        onTopicChange(
            isDynamicTask ? dynamicIndex : null,
            isDynamicTask ? (dynamicArray[dynamicIndex] ?? null) : null
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDynamicTask, dynamicIndex]);

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
            const isCalibratingVideo = isVideoEnabled && (phase === 'SETUP' || phase === 'CALIBRATE');
            onRecordingStateChange(
                recordingStatus === RECORDING_STATES.RECORDING || isCalibratingVideo || isPreparingToRecord
            );
        }
    }, [recordingStatus, onRecordingStateChange, RECORDING_STATES.RECORDING, isVideoEnabled, phase, isPreparingToRecord]);

    const prevStatusRef = useRef(recordingStatus);
    useEffect(() => {
        if (prevStatusRef.current !== recordingStatus) {
        if (recordingStatus === RECORDING_STATES.RECORDED) {
            onAudioEvent('completed');
        }
        prevStatusRef.current = recordingStatus;
        }
    }, [recordingStatus, RECORDING_STATES.RECORDED, onAudioEvent]);


    useEffect(() => {
        if (isPreparingToRecord && recordingStatus === RECORDING_STATES.RECORDING) {
            setPhase('RECORDING');
            setIsPreparingToRecord(false);
        }
    }, [recordingStatus, isPreparingToRecord, RECORDING_STATES.RECORDING]);
    // ── Handlers ─────────────────────────────────────────────────────────
    const handleStart = () => {
        onBeforeRecordingStart();
        examplePlayerRef.current?.stop();
        storyPlayerRef.current?.stop();
        onLogEvent("button_start");
        resetSpeechTrackers();
        if (isVideoEnabled) {
            // Defer actual recording until calibration completes.
            // VideoViewFinder auto-triggers the setup instructions dialog on SETUP mount.
            setPhase('SETUP');
        } else {
            setIsPreparingToRecord(true);
            recordingStartTimeoutRef.current = setTimeout(() => {
                startAudioRecording();
            }, RECORDING_START_DELAY_MS);
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
        setExampleResetTrigger(t => t + 1); // Story/example starts over on a fresh attempt
        repeatRecording();
        if (isVideoEnabled) {
            // Reset calibration flag and ensure we are in the instructions phase
            setVideoCalibrated(false);
            setPhase('RECORDING'); 
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
            // Pre-fetch MICROPHONE permission on mount for all tasks, video included.
            // This is silent if the browser already granted mic access (no native
            // prompt — it just resolves), which is what lets RecordingControls show
            // the "Start" button immediately instead of an extra "Grant microphone"
            // step for a permission the user already gave.
            //
            // CAMERA permission is intentionally NOT requested here for video tasks —
            // it's requested later, in handleRequestCameraPermission, once the user
            // has acknowledged VideoViewFinder's camera permission intro card. That
            // happens BEFORE the setup instructions dialog is shown.
            onPermissionPending(true);
            getMicrophonePermission()
                .finally(() => onPermissionPending(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPermission]);

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

    // ── Story/example playback state (owned here, driven into AudioExamplePlayer via props) ──
    const [exampleResetTrigger, setExampleResetTrigger] = useState(0);
    const [hasListenedThreshold, setHasListenedThreshold] = useState(false);
    const [isStoryPlaying, setIsStoryPlaying] = useState(false);
    const [storyAutoPlayTrigger, setStoryAutoPlayTrigger] = useState(0);

    // Only relevant for video (camera-calibration) tasks with a story clip: block
    // the Start-Calibration button until the participant has actually heard
    // enough of the story, so they can't skip straight to camera setup by accident.
    const storyListenGateActive = isVideoEnabled && exampleExists;
    const blockStartForStory = storyListenGateActive && !hasListenedThreshold;

    // ── Auto-play the story once the parent's audio guide finishes ──────────
    const prevAutoPlayStoryTriggerRef = useRef(autoPlayStoryTrigger);
    
    useEffect(() => {
        // If we have already handled this specific trigger, do nothing.
        if (autoPlayStoryTrigger === prevAutoPlayStoryTriggerRef.current) return;
        // Block the auto-play if video is enabled but we aren't at the 
        // task instructions yet (e.g., still on the PERMISSION or CALIBRATE screens).
        if (isVideoEnabled && phase !== 'RECORDING') {
            return; // Exit early WITHOUT updating the ref. This effect will automatically 
                    // try again as soon as `phase` changes to 'RECORDING'.
        }
        // We are in the correct phase. Mark this trigger as handled.
        prevAutoPlayStoryTriggerRef.current = autoPlayStoryTrigger;

        let timeoutId;
        if (exampleExists && recordingStatus === RECORDING_STATES.IDLE && !isStoryPlaying) {
            timeoutId = setTimeout(() => {
                onLogEvent("auto_play_story");
                setStoryAutoPlayTrigger(t => t + 1);
            }, 1500); 
        }
        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [autoPlayStoryTrigger, exampleExists, recordingStatus, phase, isVideoEnabled, isStoryPlaying]); 

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

    // Clear the "preparing" mask ONLY when the async recorder confirms it has actually started
    useEffect(() => {
        if (recordingStatus === RECORDING_STATES.RECORDING || recordingStatus === RECORDING_STATES.RECORDED) {
            setIsPreparingToRecord(false);
        }
    }, [recordingStatus, RECORDING_STATES]);

    // Fires the actual getUserMedia() call — this is what triggers the native
    // browser camera permission popup. Called by VideoViewFinder right after
    // the user acknowledges the MediaPermissionContent intro card (or
    // automatically if permission was already granted before), i.e. BEFORE
    // the task instructions dialog is shown.
    const handleRequestCameraPermission = async () => {
        const hasPermission = await videoRecorder.getMediaPermission();
        if (!hasPermission) {
            console.error("Camera/Mic permission denied or failed.");
        }
        return hasPermission;
    };

    // Starts calibration proper (mic permission + face detection). Assumes
    // camera permission has already been granted via
    // handleRequestCameraPermission — called after the user confirms the
    // task instructions dialog ("Ready").
    const startCalibrationInFlightRef = useRef(false);

    const handleStartCalibration = async () => {
        if (startCalibrationInFlightRef.current) return;
        startCalibrationInFlightRef.current = true;
        setPhase('CALIBRATE');
        await getMicrophonePermission();
        videoRecorder.startFaceDetection();
        startCalibrationInFlightRef.current = false;
    };

    const finishCalibrationInFlightRef = useRef(false);

    // Finish Video Calibration (Passed to VideoViewFinder)
    // This is the real "start" for video tasks — both recorders kick off here.
    const handleFinishCalibration = () => {
        if (finishCalibrationInFlightRef.current) return;
        finishCalibrationInFlightRef.current = true;

        onBeforeRecordingStart();
        examplePlayerRef.current?.stop();
        storyPlayerRef.current?.stop();
        setVideoCalibrated(true);
        setIsPreparingToRecord(true);
        recordingStartTimeoutRef.current = setTimeout(() => {
            startAudioRecording();
            videoRecorder.startRecording();
            finishCalibrationInFlightRef.current = false;
        }, RECORDING_START_DELAY_MS);
    };

    // ── Instruction parsing ───────────────────────────────────────────────
    const isCalibrationPhase = isVideoEnabled && (phase === 'SETUP' || phase === 'CALIBRATE' || (isPreparingToRecord && !videoCalibrated === false));
    const isPermissionPhase = isVideoEnabled && phase === 'PERMISSION';

    const parsedInstructions = useMemo(() => {
        let baseInstructions = instructions;
        
        const isActiveOrPreparing = recordingStatus !== RECORDING_STATES.IDLE;

        if (isCalibrationPhase) {
            baseInstructions = "To ensure accurate results, please rest your arm on a table to hold the phone completely steady. Follow instructions during the calibration and try to position your face within the frame. <strong>It is very important</strong> that you do not move the phone once the calibration is complete.";
        } else if (recordingStatus === RECORDING_STATES.RECORDED) {
            baseInstructions = completedInstructions;
        } else if (isDynamicTask && dynamicIndex > 0) {
            baseInstructions = voiceRecorder.activeInstructions || instructionsActive || instructions;
        } else if (instructionsActive && isActiveOrPreparing && !awaitingNextTopic) {
            baseInstructions = voiceRecorder.activeInstructions || instructionsActive;
        }

        const currentItem = isDynamicTask ? dynamicArray[dynamicIndex] : null;
        return interpolateInstructions(baseInstructions, isDynamicTask, currentItem, taskParams, dynamicArray);
    }, [
        instructions, instructionsActive, completedInstructions, isCalibrationPhase,
        isDynamicTask, dynamicIndex, recordingStatus, awaitingNextTopic,
        voiceRecorder.activeInstructions, dynamicArray, taskParams, RECORDING_STATES, isPreparingToRecord
    ]);

    const slots = {
        example: exampleExists ? (
            <AudioExamplePlayer
                ref={examplePlayerRef}
                src={audioExample}
                variant="example"
                recordingStatus={recordingStatus}
                onPlayingChange={(playing) => { if (playing) onExamplePlay(); }}
                onLogEvent={onLogEvent}
            />
        ) : null,
        playStory: exampleExists ? (
            <AudioExamplePlayer
                ref={storyPlayerRef}
                src={audioExample}
                variant="story"
                recordingStatus={recordingStatus}
                playTrigger={storyAutoPlayTrigger}
                resetTrigger={exampleResetTrigger}
                onThresholdReached={() => setHasListenedThreshold(true)}
                onPlayingChange={(playing) => {
                    setIsStoryPlaying(playing);
                    if (playing) onExamplePlay();
                }}
                onLogEvent={onLogEvent}
            />
        ) : null,
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
    const isActivelyRecording = recordingStatus === RECORDING_STATES.RECORDING;
    const shouldShiftTimer = hideTitle && isActivelyRecording;


    const displayRecordingStatus = recordingStatus;

    const timerContent = (
        recordingStatus !== RECORDING_STATES.RECORDED &&
        recordingStatus !== RECORDING_STATES.IDLE &&   
        !awaitingNextTopic
    ) ? (
        <>
            <RecordingTimer
                time={recordingTime}
                remainingTime={voiceRecorder.remainingTime}
                status={displayRecordingStatus}
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
    const instructionsContent = (!isCalibrationPhase && !isPermissionPhase) ? (
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
                <VideoViewFinder
                    phase={phase} 
                    videoCalibrated={videoCalibrated}
                    videoRecorder={videoRecorder} 
                    isRecording={recordingStatus === RECORDING_STATES.RECORDING} 
                    onRequestCameraPermission={handleRequestCameraPermission}
                    onPermissionGranted={() => setPhase('RECORDING')} // Moves to Task Instructions
                    onPermissionDenied={onCameraPermissionDenied}
                    onDeclineVideo={onDeclineVideo}
                    onStartCalibration={handleStartCalibration}
                    onFinishCalibration={handleFinishCalibration}
                />
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
                        disableStart={(activeUseVAD && !isVadLoaded) || blockStartForStory || isPreparingToRecord}
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
                        isPreparingToRecord={isPreparingToRecord}
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