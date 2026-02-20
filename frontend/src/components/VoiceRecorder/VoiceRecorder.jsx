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
    const voiceRecorder = useVoiceRecorder({
        onRecordingComplete,
        onError,
        instructions,
        instructionsActive,
        audioExample,
        mode,
        duration
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

    // --- VAD State & Logic ---
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [showSilenceWarning, setShowSilenceWarning] = useState(false);
    
    const silenceTimer = useRef(null);
    const vadInstance = useRef(null);
    const statusRef = useRef(recordingStatus);

    // Keep our reference to the recording status fresh for the AI callbacks
    useEffect(() => {
        statusRef.current = recordingStatus;
    }, [recordingStatus]);

    // 3. Initialize the VAD AI Model
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
                    onSpeechStart: () => {
                        setIsSpeaking(true);
                        setShowSilenceWarning(false);
                        if (silenceTimer.current) clearTimeout(silenceTimer.current);
                    },
                    onSpeechEnd: () => {
                        setIsSpeaking(false);
                        // If we are still officially recording, start the silence countdown
                        if (statusRef.current === RECORDING_STATES.RECORDING) {
                            silenceTimer.current = setTimeout(() => {
                                setShowSilenceWarning(true);
                            }, vadSilenceThreshold);
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
            if (silenceTimer.current) clearTimeout(silenceTimer.current);
        };
    }, [useVAD, stream, vadSilenceThreshold, RECORDING_STATES.RECORDING]);

    // 4. Sync VAD processing with your Record/Pause buttons
    useEffect(() => {
        if (!useVAD || !vadInstance.current) return;

        if (recordingStatus === RECORDING_STATES.RECORDING) {
            vadInstance.current.start();
            setShowSilenceWarning(false);
            if (silenceTimer.current) clearTimeout(silenceTimer.current);
            
            // Start the initial silence timer just in case they don't say anything initially
            silenceTimer.current = setTimeout(() => {
                setShowSilenceWarning(true);
            }, vadSilenceThreshold);
        } else {
            // Stop processing audio when paused or stopped to save CPU
            vadInstance.current.pause();
            setShowSilenceWarning(false);
            if (silenceTimer.current) clearTimeout(silenceTimer.current);
        }
    }, [recordingStatus, useVAD, vadSilenceThreshold, RECORDING_STATES.RECORDING]);

    // --- Wrappers ---
    const handleStart = () => {
        onLogEvent("button_start");
        startRecording();
    };

    const handleRepeat = () => {
        onLogEvent("button_repeat");
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
            taskType: 'voice'
        };
        
        // Call the parent's provided function
        onNextTask(taskData);
    };

    return (
        <div className={`task-container ${className} ${showSilenceWarning ? 'vad-warning-active' : ''}`}>
            <h1>{title}</h1>
            <p>{activeInstructions}</p>

            {/* Silence Warning Banner */}
            {useVAD && showSilenceWarning && (
                <div className="vad-warning-banner">
                    ⚠️ We don't hear anything. Please make sure you are speaking.
                </div>
            )}

            <div className={`recording-area ${isSpeaking ? 'is-speaking' : ''}`}>

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
        </div>
    );
};
