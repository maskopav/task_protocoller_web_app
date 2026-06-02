// hooks/useVoiceRecorder.js
import { useState, useRef, useEffect, useCallback } from 'react';
import { logToServer } from '../utils/frontendLogger';
import { exportWAV } from '../utils/audioUtils'; 

const WORKLET_CODE = `
class RecorderWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        this.port.onmessage = (e) => {
            if (e.data.command === 'start') this.isRecording = true;
            if (e.data.command === 'stop') this.isRecording = false;
        };
    }
    process(inputs, outputs, parameters) {
        if (!this.isRecording) return true;
        const input = inputs[0];
        if (input && input.length > 0 && input[0].length > 0) {
            // We must copy the array because the browser reuses the memory buffer
            const channelData = new Float32Array(input[0]);
            this.port.postMessage({ buffer: channelData }, [channelData.buffer]);
        }
        return true;
    }
}
registerProcessor('recorder-worklet', RecorderWorklet);
`;

export const useVoiceRecorder = (options = {}) => {
    const {
        onRecordingComplete = () => {},
        onError = () => {},
        instructions,           // initial instructions
        instructionsActive,     // instructions after START
        audioExample,       // optional audio example URL
        mode = "basicStop",  // "basicStop" | "countDown" | "delayedStop"
        duration,         // optional duration of task in seconds
        maxDuration,      // optional max duration after which recording will auto-stop
        isTimerActive = true  // VAD timer control
    } = options;

    // Recording states
    const IDLE = "idle";
    const RECORDING = "recording";
    const PAUSED = "paused";
    const RECORDED = "recorded";

    // State management
    const [incompatibleBrowser, setIncompatibleBrowser] = useState(null);
    const [recordingStatus, _setRecordingStatus] = useState(IDLE);
    const [permission, setPermission] = useState(false);
    const [stream, setStream] = useState(null);
    const [audioURL, setAudioURL] = useState(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [remainingTime, setRemainingTime] = useState(null);
    const [audioLevels, setAudioLevels] = useState(new Array(12).fill(0));
    const [activeInstructions, setActiveInstructions] = useState(instructions);
    const [exampleAudio, setExampleAudio] = useState(null);
    const [durationExpired, setDurationExpired] = useState(false);

    // REFS
    const audioChunks = useRef([]); // Now holds Float32Arrays
    const audioContext = useRef(null);
    const analyser = useRef(null);
    const animationFrame = useRef(null);
    const vizSourceRef = useRef(null);

    const scriptProcessorRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const gainNodeRef = useRef(null);
    const statusRef = useRef(IDLE); // Keeps track of status for the audio processor loop
    const audioURLRef = useRef(null); // Ref mirror of audioURL so the unmount cleanup always sees the latest value

    // Helper to sync state and ref simultaneously
    const setRecordingStatus = (status) => {
        _setRecordingStatus(status);
        statusRef.current = status;
    };

    const getMicrophonePermission = async () => {
        const ua = navigator.userAgent;

        // Detect known broken browsers
        const browserName =
            /Lite Browser/i.test(ua)   ? 'Xiaomi Lite Browser' :
            /MiuiBrowser/i.test(ua)    ? 'MIUI Browser' :
            /HuaweiBrowser/i.test(ua)  ? 'Huawei Browser' :
            /HeyTapBrowser/i.test(ua)  ? 'OPPO Browser' :
            /VivoBrowser/i.test(ua)    ? 'Vivo Browser' : null;

        // Collect all pre-flight info in one log
        logToServer("MIC | permission check", {
            browser: browserName || ua.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/)?.[0] || 'Unknown',
            incompatible: !!browserName,
            isSecureContext: window.isSecureContext,
            protocol: location.protocol,
            hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
        });

        // Block known broken browsers immediately
        if (browserName) {
            setIncompatibleBrowser(browserName);
            setPermission(false);
            return false;
        }

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            const reason = !window.isSecureContext ? 'Not a secure context (HTTPS required)' : 'getUserMedia API not available';
            logToServer("MIC | BLOCKED", { reason });
            onError(new Error(reason));
            setPermission(false);
            return false;
        }

        try {
            // Added advanced constraints to force Android HAL to back off
            const streamData = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: 1 }
            });

            const track = streamData.getAudioTracks()[0];
            try {
                await track.applyConstraints({
                    autoGainControl: false,
                    echoCancellation: false,
                    noiseSuppression: false,
                });
                logToServer("MIC | applyConstraints succeeded");
            } catch (constraintErr) {
                logToServer("MIC | applyConstraints failed (non-critical)", constraintErr.name);
            }

            const settings = track.getSettings();

            if (settings.autoGainControl || settings.echoCancellation || settings.noiseSuppression) {
                console.warn("⚠️ OS/Hardware ignored raw audio constraints!", settings);
                logToServer("MIC | WARNING: Hardware forced processing despite constraints", settings);
            }

            logToServer("MIC | granted", {
                label: track?.label || 'unknown',
                readyState: track?.readyState,
                settings: settings ?? 'unsupported',
            });

            setPermission(true);
            setStream(streamData);
            return true;

        } catch (err) {
            const diagnosisMap = {
                NotAllowedError:       'Denied by user or silent system policy',
                NotFoundError:         'No microphone hardware found',
                NotReadableError:      'Mic in use by another app',
                OverconstrainedError:  'Constraints not satisfiable on this device',
                AbortError:            'Request aborted',
                SecurityError:         'Blocked by browser security policy',
            };
            logToServer("MIC | denied", {
                error: err.name,
                diagnosis: diagnosisMap[err.name] || 'Unknown error',
            });
            setPermission(false);
            onError(err);
            return false;
        }
    };

    // Timer effect
    useEffect(() => {
        let interval = null;

        // Only tick if we are officially recording AND the VAD says they have spoken
        if (recordingStatus === RECORDING && isTimerActive) {
            interval = setInterval(() => {
                if (mode === "countDown") {
                    setRemainingTime(prev => {
                        if (prev == null) return null;
                        if (prev <= 1) {
                            stopRecording(); // stop automatically when countdown hits 0
                            return 0;
                        }
                        return prev - 1;
                    });
                } else if (mode === "delayedStop") {
                    setRecordingTime(prev => {
                        const newTime = prev + 1;
                        if (duration && newTime >= duration) {
                            setDurationExpired(true);
                        }
                        return newTime;
                    });
                } else if (mode === "basicStop") {
                    setRecordingTime(prev => prev + 1);
                }
            }, 1000);
        }

        // Cleanup interval automatically when paused, stopped, or waiting for speech
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [recordingStatus, isTimerActive, mode, duration]);


    // Recording functions
    const startRecording = async () => {
        if (!stream) return;
        stopExample(); 
        
        setDurationExpired(false); 
        audioChunks.current = []; // Clear old buffers

        if (mode === "countDown") {
            setRemainingTime(duration || 10);
        } else {
            setRecordingTime(0);
            setRemainingTime(null); // Clear remaining time for non-countdown modes
        }

        if (instructionsActive) setActiveInstructions(instructionsActive); 
        
        // 1. Setup Audio Context
        if (!audioContext.current) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();
            // Diagnostic: log what rate iOS actually gave us (should be 44100 on iPhone)
            logToServer("AudioContext | native sampleRate:", audioContext.current.sampleRate);
        }
        // Resume context for iOS Safari
        if (audioContext.current.state === 'suspended') {
            await audioContext.current.resume();
        }

        if (!audioContext.current.workletLoaded) {
            const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
            const workletUrl = URL.createObjectURL(blob);
            await audioContext.current.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);
            audioContext.current.workletLoaded = true;
        }

        const source = audioContext.current.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext.current, 'recorder-worklet', {
            numberOfOutputs: 0
        });

        // Receive raw PCM from the isolated audio thread
        workletNode.port.onmessage = (event) => {
            if (statusRef.current === RECORDING) {
                audioChunks.current.push(event.data.buffer);
            }
        };

        // Connect Pipeline — source feeds into the sink worklet; no output path needed
        source.connect(workletNode);

        // Save refs for stopping
        sourceNodeRef.current = source;
        scriptProcessorRef.current = workletNode;

        // 5. Setup Visualization
        const vizSource = audioContext.current.createMediaStreamSource(stream);
        vizSourceRef.current = vizSource;
        analyser.current = audioContext.current.createAnalyser();
        analyser.current.fftSize = 256;
        vizSource.connect(analyser.current);

        // Tell the audio thread to officially start grabbing frames
        workletNode.port.postMessage({ command: 'start' });

        setRecordingStatus(RECORDING);
    };

    const pauseRecording = () => {
        if (recordingStatus === RECORDING) {
            setRecordingStatus(PAUSED);
            // Tell the audio thread to drop frames immediately
            if (scriptProcessorRef.current) {
                scriptProcessorRef.current.port.postMessage({ command: 'stop' });
            }
        }
    };

    const resumeRecording = () => {
        if (recordingStatus === PAUSED) {
            setRecordingStatus(RECORDING);
            // Tell audio thread to resume sending frames
            if (scriptProcessorRef.current) {
                scriptProcessorRef.current.port.postMessage({ command: 'start' });
            }
        }
    };

    const stopRecording = useCallback(() => {
        setRecordingStatus(RECORDED);
        
        if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        
        // Disconnect Worklet Pipeline
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.port.postMessage({ command: 'stop' });
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current.port.onmessage = null;
        }
        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        // gainNode removed — worklet is now a sink with numberOfOutputs: 0
        // Disconnect the visualization source node 
        if (vizSourceRef.current) {
            vizSourceRef.current.disconnect();
            vizSourceRef.current = null;
        }

        // Export WAV using the NATIVE hardware sample rate
        if (audioChunks.current.length > 0 && audioContext.current) {
            const sampleRate = audioContext.current.sampleRate;
            const audioBlob = exportWAV(audioChunks.current, sampleRate);
            const url = URL.createObjectURL(audioBlob);
            
            audioURLRef.current = url;
            setAudioURL(url);
            onRecordingComplete(audioBlob, url);
        }
    }, [onRecordingComplete]); // wrapped in useCallback to safely trigger inside the timer

    const repeatRecording = () => {
        stopExample(); // stop example playback if active

        if (audioURL) {
            URL.revokeObjectURL(audioURL);
            audioURLRef.current = null;
            setAudioURL(null);
        }
        
        audioChunks.current = [];
        setRecordingTime(0);
        setRecordingStatus(IDLE);
        setAudioLevels(new Array(12).fill(0));
        setDurationExpired(false); // Reset duration expired state
        
        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }

        if (audioContext.current && audioContext.current.state !== "closed") {
            audioContext.current.close();
            audioContext.current = null;
        }                    
    };

    // Monitor the recording time and force stop
    useEffect(() => {
        if (recordingStatus === RECORDING && maxDuration && recordingTime >= maxDuration) {
            stopRecording(); // Automatically stops when limit is hit
        }
    }, [recordingTime, maxDuration, recordingStatus, stopRecording]);


    // Play audio example
    const playExample = () => {
        if (!audioExample) return;
      
        // Stop previous example if playing
        if (exampleAudio) {
          exampleAudio.pause();
          exampleAudio.currentTime = 0;
        }
      
        const audio = new Audio(audioExample);
        setExampleAudio(audio);
    
        audio.play().catch(err => {
          console.error("Error playing example audio:", err);
          setExampleAudio(null);
        });

        audio.onended = () => {
            setExampleAudio(null); // cleanup
        };
    };
      
      // Stop Example function (used by startRecording/repeatRecording)
    const stopExample = () => {
        if (exampleAudio) {
            exampleAudio.pause();
            exampleAudio.currentTime = 0;
            setExampleAudio(null);
        }
    };

    // Audio Visualization Effect 
    useEffect(() => {
        if (!analyser.current) return;

        const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
        let levels = new Array(12).fill(0); // Use a local array for current frame

        const updateLevels = () => {
            if (statusRef.current === RECORDING) {
                analyser.current.getByteFrequencyData(dataArray);

                const newLevels = [];
                const step = Math.floor(dataArray.length / 12);

                for (let i = 0; i < 12; i++) {
                    const start = i * step;
                    const end = start + step;
                    let sum = 0;

                for (let j = start; j < end && j < dataArray.length; j++) {
                    sum += dataArray[j];
                }

                    const average = sum / step;
                // Normalize to 0-100 range
                const normalized = Math.min((average / 255) * 100, 100);
                newLevels.push(normalized);
                }
                levels = newLevels;
                setAudioLevels(newLevels);

            } else {
            // Fade out when not recording (PAUSED or IDLE after recording)
                const isFading = levels.some(level => level > 0);

                if (isFading) {
                levels = levels.map(level => Math.max(0, level - 5)); // Fade by 5 units per frame
                    setAudioLevels(levels);
                } else if (statusRef.current === RECORDED) {
                    return;
                }
            }

            animationFrame.current = requestAnimationFrame(updateLevels);
        };

        // Initial kick-off
        updateLevels();

        return () => {
        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }
        };
    }, [recordingStatus, RECORDING, RECORDED]);

    // Cleanup effect
    useEffect(() => {
        return () => {
        // audioURLRef.current, not audioURL — audioURL is a stale closure value
        // from when the effect was set up (always null with dep=[])
        if (audioURLRef.current) {
            URL.revokeObjectURL(audioURLRef.current);
        }
        
        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }

        if (audioContext.current) {
            // Only close if it's not already closed
            if (audioContext.current.state !== "closed") {
                audioContext.current.close().catch(err => {
                console.warn("AudioContext close failed:", err);
                });
            }
            audioContext.current = null; // reset ref
            }

            if (vizSourceRef.current) {
                vizSourceRef.current.disconnect();
                vizSourceRef.current = null;
            }
        };
    }, []);

    return {
    // State
        recordingStatus,
        permission,
        stream,
        audioURL,
        recordingTime,
        remainingTime,
        audioLevels,
        activeInstructions,
        exampleAudio,
        durationExpired,
        incompatibleBrowser,
        audioContext,
    
    // Actions
        getMicrophonePermission,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        repeatRecording,
        playExample,
        stopExample,
    
    // Utilities
        formatTime: (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        },
    
    // Constants
        RECORDING_STATES: { IDLE, RECORDING, PAUSED, RECORDED }
    };
};