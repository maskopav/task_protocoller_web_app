import { useState, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const DEV_MODE = true; // Set to false when deploying
const FRAME_RATE_MS = 33; 

export const useVideoRecorder = ({ 
    onRecordingComplete = () => {}, 
    onError = () => {}, 
    debugMode = false 
}) => {onRecordingComplete
    const [recordingStatus, setRecordingStatus] = useState("idle");
    const [isSteady, setIsSteady] = useState(false);
    const [isFaceCorrect, setIsFaceCorrect] = useState(false);
    const [guidance, setGuidance] = useState({ text: "Positioning...", arrow: null });
    const [videoData, setVideoData] = useState(null); 
    
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const faceDetector = useRef(null);
    const requestRef = useRef(null);
    const isCalibratingRef = useRef(false);
    const hasAttemptedZoom = useRef(false);

    const streamRef = useRef(null); 
    const audioChunks = useRef([]);
    const coordinateTimeline = useRef([]);
    const recordingLoopRef = useRef(null);
    const audioRecorder = useRef(null);

    const [isLoadingModel, setIsLoadingModel] = useState(false);

    // Callback ref for the <video> element. We use a callback (rather than a
    // plain ref) because the element can mount either BEFORE or AFTER the
    // camera stream is actually obtained (getUserMedia can resolve well
    // before, or well after, the <video> tag exists in the DOM depending on
    // the permission-gating UI around it). Whichever happens second is what
    // triggers the attachment here, so the stream is never silently dropped.
    const attachVideoRef = useCallback((node) => {
        videoRef.current = node;
        if (node && streamRef.current) {
            node.srcObject = streamRef.current;
        }
    }, []);

    const getMediaPermission = async () => {
        setIsLoadingModel(true);
        try {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );
            
            faceDetector.current = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                outputFaceBlendshapes: false,
                runningMode: "VIDEO",
                numFaces: 1
            });

            const streamData = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            
            if (videoRef.current) videoRef.current.srcObject = streamData;
            streamRef.current = streamData;
            setIsLoadingModel(false); 

            return true;
        } catch (err) {
            console.error(err);
            onError(err);
            setIsLoadingModel(false);
            return false;
        }
    };

    const attemptAutoZoom = async (currentEyeDist) => {
        if (!streamRef.current) return;
        
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();

        if (capabilities.zoom) {
            const currentSettings = videoTrack.getSettings();
            const currentZoom = currentSettings.zoom || 1;
            
            // Target eye distance (0.18 is right in the middle of your 0.12 - 0.28 range)
            const targetEyeDist = 0.18; 
            const zoomFactor = targetEyeDist / currentEyeDist;
            let newZoom = currentZoom * zoomFactor;

            newZoom = Math.max(capabilities.zoom.min, Math.min(newZoom, capabilities.zoom.max));

            try {
                await videoTrack.applyConstraints({ advanced: [{ zoom: newZoom }] });
                console.log("Successfully auto-zoomed camera to:", newZoom);
            } catch (e) {
                console.warn("Hardware zoom not supported or failed", e);
            }
        }
    };

    const startFaceDetection = () => {
        setRecordingStatus("calibrating");
        isCalibratingRef.current = true;
        hasAttemptedZoom.current = false;

        const detect = () => {
            if (!videoRef.current || !canvasRef.current || !faceDetector.current) {
                if (isCalibratingRef.current) requestRef.current = requestAnimationFrame(detect);
                return;
            }

            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Ensure resolution matches BEFORE getting context
            if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const now = performance.now();
            
            if (video.readyState >= 2) {
                const result = faceDetector.current.detectForVideo(video, now);

                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    const landmarks = result.faceLandmarks[0];
                    
                    // Draw DEBUG coordinates
                    if (debugMode) {
                        ctx.fillStyle = 'white';
                        for (const point of landmarks) {
                            ctx.beginPath();
                            // Multiply 0-1 values by width/height to get actual pixels
                            ctx.arc(point.x * canvas.width, point.y * canvas.height, 1.5, 0, 2 * Math.PI);
                            ctx.fill();
                        }
                    }

                    let minX = 1, maxX = 0, minY = 1, maxY = 0;
                    for (const point of landmarks) {
                        if (point.x < minX) minX = point.x;
                        if (point.x > maxX) maxX = point.x;
                        if (point.y < minY) minY = point.y;
                        if (point.y > maxY) maxY = point.y;
                    }

                    const faceWidth = maxX - minX;
                    const faceHeight = maxY - minY;
                    const centerX = minX + faceWidth / 2;
                    const centerY = minY + faceHeight / 2;

                    // Head Rotation Check
                    const noseTip = landmarks[1];
                    const rightEye = landmarks[33];
                    const leftEye = landmarks[263];

                    // 1. Inter-Ocular Distance (Distance between eyes)
                    const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);

                    // 2. Head Symmetry
                    const rightDist = Math.hypot(rightEye.x - noseTip.x, rightEye.y - noseTip.y);
                    const leftDist = Math.hypot(leftEye.x - noseTip.x, leftEye.y - noseTip.y);
                    const symmetryRatio = Math.min(leftDist, rightDist) / Math.max(leftDist, rightDist);

                    // --- RELAXED VALIDATIONS ---
                    const isLookingForward = symmetryRatio > 0.70; // Relaxed slightly from 0.75
                    const isCenteredX = Math.abs(centerX - 0.5) < 0.18; // Relaxed from 0.15
                    const isCenteredY = Math.abs(centerY - 0.5) < 0.18; // Relaxed from 0.15

                    // LOOSENED ZOOM CONDITION: Widened to accept small/large faces if fully visible
                    const isRightSize = eyeDist > 0.09 && eyeDist < 0.32; 

                    let newGuidance = { text: "Detecting...", arrow: null };

                    // --- INTUITIVE DIRECTIVE LOGIC (Move Body instead of Device) ---
                    if (!isLookingForward) {
                        newGuidance = leftDist > rightDist 
                            ? { text: "Turn your face slightly left", arrow: "TURN_LEFT" } 
                            : { text: "Turn your face slightly right", arrow: "TURN_RIGHT" };
                    } else if (!isCenteredX) {
                        // If centerX < 0.5, face is too far left on screen -> user needs to move right
                        newGuidance = centerX < 0.5 
                            ? { text: "Move your body slightly to the right", arrow: "MOVE_RIGHT" } 
                            : { text: "Move your body slightly to the left", arrow: "MOVE_LEFT" };
                    } else if (!isCenteredY) {
                        // If centerY < 0.5, face is too high on screen -> user needs to sit lower/lean down
                        newGuidance = centerY < 0.5 
                            ? { text: "Lean slightly down", arrow: "MOVE_DOWN" } 
                            : { text: "Lean slightly up", arrow: "MOVE_UP" };
                    } else if (!isRightSize) {
                        newGuidance = eyeDist < 0.09 
                            ? { text: "Lean slightly closer to the screen", arrow: "MOVE_CLOSER" } 
                            : { text: "Lean slightly further back", arrow: "MOVE_FURTHER" };
                    } else {
                        newGuidance = { text: "Perfect! Hands on table, hold still.", arrow: "READY" };
                    }
                    setGuidance(newGuidance);

                    if (isCenteredX && isCenteredY && isRightSize && isLookingForward) {
                        setIsFaceCorrect(true); 
                        setIsSteady(true); 
                    } else {
                        setIsFaceCorrect(false);
                        setIsSteady(false);
                    }
                } else {
                    setIsFaceCorrect(false);
                    setIsSteady(false);
                    setGuidance({ text: "No face detected. Look at the camera.", arrow: null });
                }
            }

            if (isCalibratingRef.current) {
                requestRef.current = requestAnimationFrame(detect);
            }
        };

        requestRef.current = requestAnimationFrame(detect);
    };

    const startRecording = () => {
        if (!streamRef.current) return;
        
        isCalibratingRef.current = false; // Stop drawing green dots

        setVideoData(null);

        // Clear the canvas so the frozen dots disappear
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }

        if (canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        audioChunks.current = [];
        coordinateTimeline.current = []; 
        
        // Isolate audio track for privacy
        const audioTrack = streamRef.current.getAudioTracks()[0];
        const audioStream = new MediaStream([audioTrack]);
        
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                         ? 'audio/webm;codecs=opus' : 'audio/mp4';
                         
        audioRecorder.current = new MediaRecorder(audioStream, { mimeType });
        
        audioRecorder.current.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.current.push(e.data);
        };
        
        audioRecorder.current.onstop = () => {
            const audioBlob = new Blob(audioChunks.current, { type: mimeType });
            const finalCoordinates = coordinateTimeline.current;
            
            //  Save the coordinates to state
            setVideoData(finalCoordinates);
            
            onRecordingComplete({
                audioBlob: audioBlob,
                coordinates: finalCoordinates
            });
        };
        
        audioRecorder.current.start();
        setRecordingStatus("recording");

        const captureCoordinates = () => {
            if (videoRef.current && faceDetector.current && recordingStatus !== "recorded") {
                const now = performance.now();
                const result = faceDetector.current.detectForVideo(videoRef.current, now);
                
                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    coordinateTimeline.current.push({
                        timestamp: now,
                        landmarks: result.faceLandmarks[0] 
                    });
                }
                recordingLoopRef.current = setTimeout(captureCoordinates, FRAME_RATE_MS);
            }
        };
        
        captureCoordinates();
    };

    const stopRecording = () => {
        if (audioRecorder.current && audioRecorder.current.state !== "inactive") {
            audioRecorder.current.stop();
        }
        if (recordingLoopRef.current) {
            clearTimeout(recordingLoopRef.current);
        }
        setRecordingStatus("recorded");
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };

    return {
        videoRef, attachVideoRef, canvasRef, recordingStatus, isSteady, 
        isFaceCorrect, guidance, getMediaPermission, 
        startFaceDetection, startRecording, stopRecording,
        isLoadingModel, videoData
    };

};