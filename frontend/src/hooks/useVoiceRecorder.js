// hooks/useVoiceRecorder.js
import { useState, useRef, useEffect, useCallback } from 'react';
import { logger } from '../utils/frontendLogger';
import { initSession, appendChunk, clearSession } from '../utils/audioIDB';
import { finalizeRecording } from '../utils/finalizeRecording';

// ─────────────────────────────────────────────────────────────────────────────
// Recording state machine constants.
// MOVED outside the hook: defined inside the hook body they are recreated as
// new string primitives on every render.  While JS compares primitives by
// value so === still works, keeping them outside makes it unambiguous that they
// are stable and never need to appear in useCallback / useEffect dep arrays.
// ─────────────────────────────────────────────────────────────────────────────
const IDLE      = 'idle';
const RECORDING = 'recording';
const PAUSED    = 'paused';
const RECORDED  = 'recorded';

// How many level "buckets" the visualizer gets per frame, and how often we
// bother computing them. Uncapped (i.e. tied to display refresh rate) means
// 90-120 FFT reads + array allocations per second on many Android phones —
// no meter needs to update that often, and it's the main source of jank on
// weaker devices. 25fps is plenty smooth for a level meter.
const LEVEL_BUCKETS = 12;
const LEVEL_FRAME_INTERVAL_MS = 1000 / 25;

// ─────────────────────────────────────────────────────────────────────────────
// AudioWorklet source — inlined as a string so no extra build step or
// public-folder asset is required.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// AudioWorklet source — inlined as a string so no extra build step or
// public-folder asset is required.
// ─────────────────────────────────────────────────────────────────────────────
const WORKLET_CODE = `
class RecorderWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        
        // 4096 samples = exactly 32 audio quanta (128 samples each).
        // At 48kHz, this fires a message to the main thread ~11.7 times per second
        this.batchSize = 4096;
        this.buffer = new Int16Array(this.batchSize);
        this.offset = 0;

        this.port.onmessage = (e) => {
            if (e.data.command === 'start') {
                this.isRecording = true;
            } else if (e.data.command === 'stop') {
                this.isRecording = false;
                this.flush(); // Catch the final tail of the recording
            }
        };
    }

    flush() {
        if (this.offset > 0) {
            // .slice() creates a new Int16Array with its own tightly-packed ArrayBuffer
            // containing only the recorded samples (important for the very last chunk)
            const chunk = this.buffer.slice(0, this.offset);
            
            // Transfer ownership to the main thread
            this.port.postMessage({ buffer: chunk.buffer }, [chunk.buffer]);
            
            // Reset state for the next batch
            this.offset = 0;
            this.buffer = new Int16Array(this.batchSize);
        }
    }

    process(inputs) {
        if (!this.isRecording) return true;
        const input = inputs[0];
        if (!input || !input[0] || !input[0].length) return true;

        const float = input[0];
        
        for (let i = 0; i < float.length; i++) {
            // Encode Float32 → Int16 PCM here, on the audio thread.
            const s = float[i] < -1 ? -1 : float[i] > 1 ? 1 : float[i];
            this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            
            // Send to main thread only when our batch is full
            if (this.offset >= this.batchSize) {
                this.flush();
            }
        }
        return true;
    }
}
registerProcessor('recorder-worklet', RecorderWorklet);
`;

// ─────────────────────────────────────────────────────────────────────────────
// iOS gain compensation.
//
// WebKit initialises AVAudioSession in a way that attenuates the web-audio
// capture path by roughly 10 dB relative to Android / desktop browsers.
// A 3× linear boost (~9.5 dB) brings typical speech into a healthy amplitude
// range.  At ~0.05 raw amplitude × 3 = 0.15 — plenty of headroom before the
// worklet's ±1.0 clamp fires.
//
// IMPORTANT: all iOS browsers (Chrome, Firefox, Edge on iOS) are built on
// WebKit and share the same AVAudioSession path, so UA-based detection of
// iPad|iPhone|iPod is the correct strategy — it's not Safari-specific.
//
// If you need bit-exact unprocessed PCM regardless of platform, pass
// inputGain={1.0} explicitly to the hook.
// ─────────────────────────────────────────────────────────────────────────────
const resolveInputGain = (override) => {
    if (override !== undefined) return override;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                  navigator.maxTouchPoints > 0;
    return isIOS ? 3.0 : 1.0;
};

export const useVoiceRecorder = (options = {}) => {
    const {
        onRecordingComplete = () => {},
        onError             = () => {},
        instructions,               // shown before recording starts
        instructionsActive,         // shown after START
        audioExample,               // optional example audio URL
        mode         = 'basicStop', // 'basicStop' | 'countDown' | 'delayedStop'
        duration,                   // task duration in seconds
        maxDuration,                // hard cap — auto-stops recording when reached
        isTimerActive = true,       // VAD timer gate
        inputGain,                  // override gain; default: auto-detected
    } = options;

    // ── State ──────────────────────────────────────────────────────────────────
    const [incompatibleBrowser, setIncompatibleBrowser] = useState(null);
    const [recordingStatus, _setRecordingStatus]        = useState(IDLE);
    const [permission,  setPermission]  = useState(false);
    const [stream,      setStream]      = useState(null);
    const [audioURL,    setAudioURL]    = useState(null);
    const [recordingTime,  setRecordingTime]  = useState(0);
    const [remainingTime,  setRemainingTime]  = useState(null);
    const [activeInstructions, setActiveInstructions] = useState(null);
    const [durationExpired, setDurationExpired] = useState(false);

    // ── Refs ───────────────────────────────────────────────────────────────────
    const chunkCountRef = useRef(0);
    const pendingWritesRef = useRef(Promise.resolve());
    const pcmBatchRef = useRef([]);
    const audioContext      = useRef(null);
    const analyser          = useRef(null);
    const animationFrame    = useRef(null);
    const audioLevelsRef = useRef([]);
    const subscribersRef = useRef(new Set());

    // renamed scriptProcessorRef → workletNodeRef.
    // The old name referred to the deprecated ScriptProcessorNode API;
    // this ref holds an AudioWorkletNode which is a completely different object.
    const workletNodeRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const inputGainRef = useRef(null);    // GainNode between source and worklet
    const statusRef = useRef(IDLE);
    const audioURLRef       = useRef(null);
    const firstChunkTimeRef = useRef(null);

    // track the stream in a ref so the unmount cleanup can always reach
    // the latest value.  The cleanup useEffect closes over the initial render
    // where stream === null; without this ref it would never stop the mic track,
    // leaving the recording-indicator light on after unmount.
    const streamRef = useRef(null);
    useEffect(() => { streamRef.current = stream; }, [stream]);

    // Helper: keep state and ref in sync simultaneously.
    const setRecordingStatus = (status) => {
        _setRecordingStatus(status);
        statusRef.current = status;
    };

    const getMicrophonePermission = async (releaseImmediately = false) => {
        const ua = navigator.userAgent;

        // Detect known broken browsers
        const browserName =
            /Lite Browser/i.test(ua)  ? 'Xiaomi Lite Browser' :
            /MiuiBrowser/i.test(ua)   ? 'MIUI Browser'        :
            /HuaweiBrowser/i.test(ua) ? 'Huawei Browser'      :
            /HeyTapBrowser/i.test(ua) ? 'OPPO Browser'        :
            /VivoBrowser/i.test(ua)   ? 'Vivo Browser'        : null;

        // Block known broken browsers immediately
        if (browserName) {
            setIncompatibleBrowser(browserName);
            setPermission(false);
            return false;
        }

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            const reason = !window.isSecureContext
                ? 'Not a secure context (HTTPS required)'
                : 'getUserMedia API not available';
            logger.warn("Microphone access blocked", { reason });
            onError(new Error(reason));
            setPermission(false);
            return false;
        }

        // stop any pre-existing stream tracks before requesting a new one.
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            setStream(null);
            streamRef.current = null;
        }

        try {
            const streamData = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: 1 }
            });

            const track = streamData.getAudioTracks()[0];
            try {
                // Re-apply constraints: some Android Chrome builds only honour
                // them here, not in the initial getUserMedia call.
                await track.applyConstraints({
                    autoGainControl:  false,
                    echoCancellation: false,
                    noiseSuppression: false,
                });
            } catch (constraintErr) {
                logger.warn("applyConstraints failed (non-critical)", { error: constraintErr.name });
            }

            const settings = track.getSettings();
            if (settings.autoGainControl || settings.echoCancellation || settings.noiseSuppression) {
                console.warn('⚠️ OS/Hardware ignored raw audio constraints!', settings);
                logger.warn("Hardware forced audio processing despite constraints", { settings });
            }

            // Create the AudioContext here so the VAD can share it.
            if (!audioContext.current) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioContext.current = new AudioContextClass();
            }

            setPermission(true);
            // If true, kill the track instantly so iOS restores system volume.
            if (releaseImmediately) {
                streamData.getTracks().forEach(track => track.stop());
                setStream(null);
            } else {
                setStream(streamData);
            }
            
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
            logger.error("Microphone access denied", err, { 
                diagnosis: diagnosisMap[err.name] || 'Unknown error' 
            });
            setPermission(false);
            onError(err);
            return false;
        }
    };

    // Timer effect
    useEffect(() => {
        let interval = null;

        if (recordingStatus === RECORDING && isTimerActive) {
            interval = setInterval(() => {
                if (mode === 'countDown') {
                    // pure state update only — do NOT call stopRecording() here.
                    // React state updater functions must be pure (no side-effects);
                    // React StrictMode intentionally calls them twice in development,
                    // which would fire stopRecording() twice and double-call
                    // onRecordingComplete.  A dedicated effect below watches for
                    // remainingTime === 0 and performs the stop there.
                    setRemainingTime(prev => {
                        if (prev == null) return null;
                        if (prev <= 1)    return 0;
                        return prev - 1;
                    });
                } else if (mode === 'delayedStop') {
                    setRecordingTime(prev => {
                        const newTime = prev + 1;
                        if (duration && newTime >= duration) setDurationExpired(true);
                        return newTime;
                    });
                } else {
                    setRecordingTime(prev => prev + 1);
                }
            }, 1000);
        }

        return () => { if (interval) clearInterval(interval); };
    }, [recordingStatus, isTimerActive, mode, duration]);

    // countDown stop — side-effect lives here, never inside a setState updater.
    // remainingTime reaches exactly 0 only via the timer above, so this fires once
    // at the natural end of the countdown.  The idempotency guard in stopRecording
    // makes this safe even if the maxDuration effect fires in the same cycle.
    useEffect(() => {
        if (mode === 'countDown' && remainingTime === 0 && recordingStatus === RECORDING) {
            stopRecording();
        }
    // stopRecording is excluded from deps intentionally: it reads everything
    // through refs so it is always current even when the callback identity
    // has not changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remainingTime]);

    const subscribeToAudioLevels = useCallback((callback) => {
        subscribersRef.current.add(callback);
        return () => subscribersRef.current.delete(callback);
    }, []);

        const flushPCMChunkBatch = useCallback(() => {
        if (pcmBatchRef.current.length === 0) return pendingWritesRef.current;

        let totalSamples = 0;
        for (let i = 0; i < pcmBatchRef.current.length; i++) {
            totalSamples += pcmBatchRef.current[i].byteLength >> 1;
        }

        const merged = new Int16Array(totalSamples);
        let offset = 0;

        for (let i = 0; i < pcmBatchRef.current.length; i++) {
            const chunk = pcmBatchRef.current[i];
            merged.set(chunk, offset);
            offset += chunk.length;
        }

        pcmBatchRef.current = [];
        pendingWritesRef.current = pendingWritesRef.current.then(() =>
            appendChunk(merged.buffer)
        );
        return pendingWritesRef.current;
    }, []);

    const enqueuePCMChunk = useCallback((buffer) => {
        const chunk = new Int16Array(buffer);
        pcmBatchRef.current.push(chunk);

        // 16 worklet quanta = 2048 samples; small RAM footprint, far fewer IDB writes.
        if (pcmBatchRef.current.length >= 16) {
            flushPCMChunkBatch().catch(err =>
                logger.error("Failed to flush PCM chunk batch to IDB", err)
            );
        }
    }, [flushPCMChunkBatch]);

    // ── Recording ──────────────────────────────────────────────────────────────
    const startRecording = async () => {
        // guard against a double-start.  Without this, calling startRecording
        // twice would create a second audio graph on top of the first, leaving both
        // worklets writing to audioChunks simultaneously and corrupting the PCM.
        if (statusRef.current === RECORDING) return;

        // Fetch a fresh stream if we released it earlier
        let activeStream = streamRef.current;
        if (!activeStream || activeStream.getAudioTracks()[0].readyState === 'ended') {
            try {
                activeStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: 1 }
                });
                setStream(activeStream);
            } catch (err) {
                logger.error("Failed to re-acquire microphone on start", err);
                onError(err);
                return;
            }
        }

        setDurationExpired(false);
        chunkCountRef.current = 0;
        pcmBatchRef.current = [];
        pendingWritesRef.current = Promise.resolve();
        await initSession();

        if (mode === 'countDown') {
            setRemainingTime(duration || 10);
        } else {
            setRecordingTime(0);
            setRemainingTime(null);
        }

        if (instructionsActive) setActiveInstructions(instructionsActive);

        // AudioContext is normally created in getMicrophonePermission so the VAD
        // can share it.  This branch fires only after repeatRecording() closes it.
        if (!audioContext.current) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();
        }

        // iOS Safari: AudioContext must be resumed inside a user-gesture handler.
        if (audioContext.current.state === 'suspended') {
            await audioContext.current.resume();
        }

        // The workletLoaded flag lives on the AudioContext instance so it resets
        // automatically whenever repeatRecording() creates a fresh context.
        if (!audioContext.current.workletLoaded) {
            const blob      = new Blob([WORKLET_CODE], { type: 'application/javascript' });
            const workletUrl = URL.createObjectURL(blob);
            if (!audioContext.current.audioWorklet || typeof AudioWorkletNode === 'undefined') {
                const err = new Error('AudioWorklet is not supported in this browser.');
                logger.fatal("AudioWorklet unsupported by browser", err);
                onError(err);
                return;
            }
            await audioContext.current.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);
            audioContext.current.workletLoaded = true;
        }

        const source = audioContext.current.createMediaStreamSource(activeStream);
        sourceNodeRef.current = source;

        // Input gain — compensates for the iOS WebKit audio-path attenuation.
        // Inserted before the worklet so the boosted samples are what ends up
        // in audioChunks and ultimately in the WAV file.
        // The analyser is also connected here so the visualisation bars reflect
        // the actual recorded level, not the raw (quiet) iOS signal.
        const gainValue    = resolveInputGain(inputGain);
        const inputGainNode = audioContext.current.createGain();
        inputGainNode.gain.value = gainValue;
        inputGainRef.current = inputGainNode;

        const workletNode = new AudioWorkletNode(audioContext.current, 'recorder-worklet', {
            numberOfOutputs: 0,
        });

        workletNode.port.onmessage = (event) => {
            if (statusRef.current !== RECORDING) return;

            if (chunkCountRef.current === 0) {
                firstChunkTimeRef.current = Date.now();
            }

            chunkCountRef.current += 1;
            enqueuePCMChunk(event.data.buffer);
        };

        // Pipeline Branch 1: source → workletNode (Raw, untouched audio for saving)
        source.connect(workletNode);

        // Pipeline Branch 2: source → inputGainNode → analyser (Boosted audio ONLY for UI visualizer)
        source.connect(inputGainNode);
        
        analyser.current = audioContext.current.createAnalyser();
        analyser.current.fftSize = 256;
        inputGainNode.connect(analyser.current);

        workletNode.port.postMessage({ command: 'start' });

        setRecordingStatus(RECORDING);
    };

    const pauseRecording = () => {
        if (statusRef.current === RECORDING) {
            setRecordingStatus(PAUSED);
        
            // Tell worklet to pause saving PCM data
            if (workletNodeRef.current) {
                workletNodeRef.current.port.postMessage({ command: 'stop' });
            }
            
            // CATCH AND RELEASE: Kill the mic track so iOS restores system volume!
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        }
    };

    const resumeRecording = async () => {
        if (statusRef.current === PAUSED) {
            
            // Re-acquire the stream silently
            let activeStream = streamRef.current;
            if (!activeStream || activeStream.getAudioTracks()[0].readyState === 'ended') {
                try {
                    activeStream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: 1 }
                    });
                    setStream(activeStream);
                    
                    // Re-connect the new stream to our existing audio graph
                    if (audioContext.current && inputGainRef.current && workletNodeRef.current) {
                        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
                        
                        const source = audioContext.current.createMediaStreamSource(activeStream);
                        sourceNodeRef.current = source;
                        
                        // Reconnect pipeline branches exactly as startRecording does
                        source.connect(workletNodeRef.current);
                        source.connect(inputGainRef.current);
                    }
                } catch (err) {
                    logger.error("MIC | failed to re-acquire on resume", err);
                    onError(err);
                    return;
                }
            }

            setRecordingStatus(RECORDING);
            
            // Tell worklet to resume saving PCM data
            if (workletNodeRef.current) {
                workletNodeRef.current.port.postMessage({ command: 'start' });
            }
        }
    };

    const stopRecording = useCallback(() => {
        // idempotency guard — both the countDown effect and the maxDuration
        // effect below can call stopRecording in the same render cycle.
        // The ref check is synchronous: the first call sets statusRef to RECORDED,
        // so any re-entrant call returns immediately before onRecordingComplete fires.
        if (statusRef.current !== RECORDING && statusRef.current !== PAUSED) return;

        setRecordingStatus(RECORDED);

        // KILL THE TRACK: Restores iOS system volume for playback and retries
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        if (animationFrame.current) cancelAnimationFrame(animationFrame.current);

        if (workletNodeRef.current) {
            workletNodeRef.current.port.postMessage({ command: 'stop' });
            workletNodeRef.current.disconnect();
            workletNodeRef.current.port.onmessage = null;
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
        }

        // Disconnecting inputGainNode severs both downstream connections:
        // the worklet and the analyser node.
        if (inputGainRef.current) {
            inputGainRef.current.disconnect();
            inputGainRef.current = null;
        }

        // Build the upload Blob: downsample to TARGET_SAMPLE_RATE when the
        // device's native rate is higher, then encode losslessly as FLAC
        // (falls back to WAV on either step's failure) -- see finalizeRecording.js.
        if (chunkCountRef.current > 0 && audioContext.current) {
            const sampleRate = audioContext.current.sampleRate;

            flushPCMChunkBatch()
                .then(() => pendingWritesRef.current)
                .then(() => finalizeRecording(sampleRate))
                .then((audioBlob) => {
                    const url = URL.createObjectURL(audioBlob);
                    audioURLRef.current = url;
                    setAudioURL(url);
                    onRecordingComplete(audioBlob, url);
                })
                .catch((err) => {
                    logger.error("Failed to build WAV from IDB", err);
                    onError(err);
                });
        }
    }, [onRecordingComplete]); // wrapped in useCallback to safely trigger inside the timer

    const repeatRecording = async () => {
        if (audioURL) {
            URL.revokeObjectURL(audioURL);
            audioURLRef.current = null;
            setAudioURL(null);
        }

        const inFlightWrites = pendingWritesRef.current;

        chunkCountRef.current = 0;
        pcmBatchRef.current = [];
        pendingWritesRef.current = Promise.resolve();
        firstChunkTimeRef.current = null;

        // clear stale node refs so nothing accidentally reaches them between
        // repeatRecording() and the next startRecording() call.
        workletNodeRef.current = null;
        sourceNodeRef.current  = null;
        analyser.current       = null;

        setRecordingTime(0);
        setRecordingStatus(IDLE);
        audioLevelsRef.current = new Array(LEVEL_BUCKETS).fill(0);
        subscribersRef.current.forEach((cb) => cb(audioLevelsRef.current));
        setDurationExpired(false); // Reset duration expired state

        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }

        // Close the AudioContext so the next startRecording() creates a fresh
        // context and re-loads the worklet into it.  The stream (MediaStream from
        // getUserMedia) is intentionally kept alive so the mic permission and the
        // track remain valid for the next recording without asking the user again.
        if (audioContext.current && audioContext.current.state !== 'closed') {
            audioContext.current.close();
            audioContext.current = null;
        }
        // Await in-flight transactions before wiping the database ──
        try {
            await inFlightWrites;
        } catch (err) {
            // Ignore previous chunk write errors; we are clearing the session anyway
        }
        
        clearSession().catch(err => logger.error("Failed to clear audio session from IDB", err));
        
    };

    // Monitor the recording time and force stop
    useEffect(() => {
        if (recordingStatus === RECORDING && maxDuration && recordingTime >= maxDuration) {
            stopRecording(); // Automatically stops when limit is hit
        }
    }, [recordingTime, maxDuration, recordingStatus, stopRecording]);

    // Audio Visualization Effect
    //
    // Runs at a capped ~25fps (LEVEL_FRAME_INTERVAL_MS) instead of tracking the
    // display's native refresh rate.
    useEffect(() => {
        if (!analyser.current) return;

        const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
        const levels = audioLevelsRef.current.length === LEVEL_BUCKETS
            ? audioLevelsRef.current
            : new Array(LEVEL_BUCKETS).fill(0);
        audioLevelsRef.current = levels;

        const step = Math.floor(dataArray.length / LEVEL_BUCKETS);
        let lastFrameTime = 0;

        const updateLevels = (now) => {
            animationFrame.current = requestAnimationFrame(updateLevels);

            if (now - lastFrameTime < LEVEL_FRAME_INTERVAL_MS) return;
            lastFrameTime = now;

            if (statusRef.current === RECORDING) {
                analyser.current.getByteFrequencyData(dataArray);

                for (let i = 0; i < LEVEL_BUCKETS; i++) {
                    const start = i * step;
                    const end = start + step;
                    let sum = 0;
                    for (let j = start; j < end && j < dataArray.length; j++) {
                        sum += dataArray[j];
                    }
                    levels[i] = Math.min((sum / step / 255) * 100, 100);
                }
                subscribersRef.current.forEach((cb) => cb(levels));

            } else {
                // Fade out when not recording.
                const isFading = levels.some(level => level > 0);
                if (isFading) {
                    for (let i = 0; i < levels.length; i++) {
                        levels[i] = Math.max(0, levels[i] - 5);
                    }
                    subscribersRef.current.forEach((cb) => cb(levels));
                } else if (statusRef.current === RECORDED) {
                    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
                    // Stop the rAF loop once fully faded.
                }
            }
        };

        animationFrame.current = requestAnimationFrame(updateLevels);

        return () => {
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        };
    }, [recordingStatus]); // RECORDING / RECORDED are module-level constants; removed from deps.

    // Cleanup effect
    useEffect(() => {
        return () => {
            // Use refs, not state, to avoid stale closure values captured at
            // mount time (stream, audioURL are both null on first render).
            chunkCountRef.current = 0;
            pcmBatchRef.current = [];
            pendingWritesRef.current = Promise.resolve();
            if (audioURLRef.current) URL.revokeObjectURL(audioURLRef.current);
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            if (inputGainRef.current) {
                inputGainRef.current.disconnect();
                inputGainRef.current = null;
            }

            if (audioContext.current && audioContext.current.state !== 'closed') {
                audioContext.current.close().catch(err => {
                    console.warn('AudioContext close failed:', err);
                });
                audioContext.current = null;
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
        audioLevelsRef,
        subscribeToAudioLevels,
        activeInstructions,
        durationExpired,
        incompatibleBrowser,
        audioContext,
        firstChunkTimeRef,

        // Actions
        getMicrophonePermission,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        repeatRecording,

        // Utilities
        formatTime: (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        },

        // Constants
        RECORDING_STATES: { IDLE, RECORDING, PAUSED, RECORDED },
    };
};