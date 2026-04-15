import { useState, useRef, useEffect } from 'react';
import { logToServer } from '../utils/frontendLogger';

// VAD config - all parameters
const VAD_CONFIG = {
    // TIMING
    silenceFreezeMs: 3000,       // time until the timer freezes (and warning appears for static tasks)
    topicPromptDelayMs: 9500,    // time until the topic automatically switches (Dynamic Tasks only)
    earlyStopMs: 13500,          // total silence time on static task (or last dynamic topic) before early stop unlocks

    // TUNED PARAMETERS FOR LONG SPEECH (https://docs.vad.ricky0123.com/user-guide/algorithm/#configuration)
    positiveSpeechThreshold: 0.35, // determines the threshold over which a probability is considered to indicate the presence of speech, default: 0.3
    negativeSpeechThreshold: 0.25, // determines the threshold under which a probability is considered to indicate the absence of speech, default: 0.25
    redemptionMs: 1500,            // number of milliseconds of speech-negative frames to wait before ending a speech segment, default: 1400
    preSpeechPadMs: 800,           // number of milliseconds of audio to prepend to a speech segment. default: 800
    minSpeechMs: 500,              // minimum duration in milliseconds for a speech segment, default: 400
};

const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox'))  return { browser: 'Firefox',  ua };
    if (ua.includes('Edg/'))     return { browser: 'Edge',     ua };
    if (ua.includes('OPR/') || ua.includes('Opera/')) return { browser: 'Opera', ua };
    if (ua.includes('Chrome'))   return { browser: 'Chrome',   ua };
    if (ua.includes('Safari'))   return { browser: 'Safari',   ua };
    return { browser: 'Unknown', ua };
};

export const useVadLogic = ({
    useVAD,
    vadConfigOverride = {},
    stream,
    audioContext,
    recordingStatus,
    RECORDING_STATES,
    pauseRecording,
    onVadSpeechStart = null,
    onVadSpeechEnd = null,
    // Dynamic task context
    isDynamicTask,
    dynamicArray,
    dynamicIndex,
    awaitingNextTopic,
    promptTopicSwitch,
    setPromptTopicSwitch,
    disableTimerFreeze,
}) => {

    // --- State ---
    const [isVadLoaded, setIsVadLoaded] = useState(!useVAD);
    const [vadFailed, setVadFailed] = useState(false);

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSilentPause, setIsSilentPause] = useState(false);
    const [canEarlyStop, setCanEarlyStop] = useState(false);
    const [hasSpoken, setHasSpoken] = useState(false);
    const [speechProb, setSpeechProb] = useState(0);

    // --- Derived ---
    const activeUseVAD = useVAD && !vadFailed;

    // --- Refs ---
    const vadInstance = useRef(null);
    const isInitializingVad = useRef(false);
    const statusRef = useRef(recordingStatus);

    const isSpeakingRef = useRef(false);
    const hasSpokenRef = useRef(false);
    const lastSpeechTimeRef = useRef(Date.now());
    const speechSegments = useRef([]);
    const currentSpeechStart = useRef(null);

    // --- Keep statusRef fresh ---
    useEffect(() => {
        statusRef.current = recordingStatus;
        // Give a fresh silence window whenever recording starts or resumes
        if (recordingStatus === RECORDING_STATES.RECORDING) {
            lastSpeechTimeRef.current = Date.now();
        }
    }, [recordingStatus, RECORDING_STATES.RECORDING]);

    // --- Adaptive silence detection interval ---
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
                        setIsSilentPause(true);
                    }

                    // Check for Topic Switch (Triggered at 9.5s, Dynamic Tasks only)
                    if (hasMoreTopics && silenceDuration >= VAD_CONFIG.topicPromptDelayMs && !promptTopicSwitch) {
                        setPromptTopicSwitch(true);
                        pauseRecording();
                        lastSpeechTimeRef.current = Date.now();
                    }

                    // Check for Early Stop (Triggered at 13.5s on static tasks or final topic)
                    if (!hasMoreTopics && silenceDuration >= VAD_CONFIG.earlyStopMs) {
                        setCanEarlyStop(true);
                    }
                }
            }
        }, 500);

        return () => clearInterval(interval);
    }, [
        activeUseVAD,
        isDynamicTask,
        dynamicArray.length,
        dynamicIndex,
        RECORDING_STATES.RECORDING,
        awaitingNextTopic,
        promptTopicSwitch,
        disableTimerFreeze,
    ]);

    // --- Initialize the VAD AI Model ---
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

                const basePath = `${import.meta.env.BASE_URL}vad/`;
                const activeVadConfig = { ...VAD_CONFIG, ...vadConfigOverride };
                const vadStream = stream.clone();

                vadInstance.current = await window.vad.MicVAD.new({
                    stream: vadStream,
                    audioContext: audioContext?.current,
                    onnxWASMBasePath: basePath,
                    baseAssetPath: basePath,
                    workletURL: basePath + "vad.worklet.bundle.min.js",
                    modelURL: basePath + "silero_vad_v5.onnx",
                    ortConfig: (ort) => {
                        ort.env.wasm.simd = false;
                        ort.env.wasm.numThreads = 1;
                        ort.env.wasm.wasmPaths = basePath;
                    },
                    positiveSpeechThreshold: activeVadConfig.positiveSpeechThreshold,
                    negativeSpeechThreshold: activeVadConfig.negativeSpeechThreshold,
                    redemptionMs: activeVadConfig.redemptionMs,
                    preSpeechPadMs: activeVadConfig.preSpeechPadMs,
                    minSpeechMs: activeVadConfig.minSpeechMs,

                    onFrameProcessed: (probs) => {
                        setSpeechProb(probs.isSpeech);
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
                                durationMs: Date.now() - currentSpeechStart.current,
                            });
                            currentSpeechStart.current = null;
                        }

                        if (onVadSpeechEnd) onVadSpeechEnd();
                    },
                });

                setIsVadLoaded(true);

                // If the user clicked Record while the model was still loading, start it immediately
                if (statusRef.current === RECORDING_STATES.RECORDING) {
                    vadInstance.current.start();
                }
            } catch (error) {
                console.error("Failed to load VAD model:", error);
                logToServer("Failed to load VAD model", { ...getBrowserInfo(), error: error.message || error.toString() });
                isInitializingVad.current = false;
                setVadFailed(true);
                setIsVadLoaded(true); // Unlock the UI Start button even on failure
            }
        };

        const vadInitTimer = setTimeout(initVAD, 500);

        return () => {
            clearTimeout(vadInitTimer);
            if (vadInstance.current) {
                vadInstance.current.pause();
                if (vadInstance.current.stream) {
                    vadInstance.current.stream.getTracks().forEach(track => track.stop());
                }
                vadInstance.current = null;
            }
        };
    }, [activeUseVAD, stream, RECORDING_STATES.RECORDING]);

    // --- Save final segment if the user hits Stop mid-sentence ---
    useEffect(() => {
        if (recordingStatus === RECORDING_STATES.RECORDED && currentSpeechStart.current) {
            speechSegments.current.push({
                startTime: currentSpeechStart.current,
                endTime: Date.now(),
                durationMs: Date.now() - currentSpeechStart.current,
            });
            currentSpeechStart.current = null;
        }
    }, [recordingStatus, RECORDING_STATES.RECORDED]);

    // --- Sync VAD engine with Pause / Play ---
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

    // --- Helpers exposed to Recorder ---

    // Full reset
    const resetSpeechTrackers = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        hasSpokenRef.current = false;
        setHasSpoken(false);
        setIsSilentPause(false);
        setCanEarlyStop(false);
        setSpeechProb(0);
        lastSpeechTimeRef.current = Date.now();
        currentSpeechStart.current = null;
    };

    const clearSpeechSegments = () => {
        speechSegments.current = [];
        currentSpeechStart.current = null;
    };

    // Reset only the silence clock 
    const resetSilenceClock = () => {
        lastSpeechTimeRef.current = Date.now();
    };

    // Clear the silence-pause flag 
    const clearSilenceState = () => {
        setIsSilentPause(false);
    };

    return {
        // State
        isVadLoaded,
        vadFailed,
        activeUseVAD,
        isSpeaking,
        isSilentPause,
        canEarlyStop,
        hasSpoken,
        speechProb,
        // Refs (read-only from Recorder)
        speechSegments,
        // Helpers
        resetSpeechTrackers,
        clearSpeechSegments,
        resetSilenceClock,
        clearSilenceState,
    };
};