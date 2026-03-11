import { useState, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const DEV_MODE = true; // Set to false when deploying
const FRAME_RATE_MS = 20; // Processing of the video frame takes time -> plus around 40ms 

export const useVideoRecorder = ({ 
    onRecordingComplete = () => {}, 
    onError = () => {}, 
    debugMode = false 
}) => {
    const [recordingStatus, setRecordingStatus] = useState("idle");
    const [isSteady, setIsSteady] = useState(false);
    const [isFaceCorrect, setIsFaceCorrect] = useState(false);
    const [guidance, setGuidance] = useState({ text: "Positioning...", arrow: null });
    
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const faceDetector = useRef(null);
    const requestRef = useRef(null);
    const isCalibratingRef = useRef(false);

    const streamRef = useRef(null); 
    const audioChunks = useRef([]);
    const coordinateTimeline = useRef([]);
    const recordingLoopRef = useRef(null);
    const audioRecorder = useRef(null);

    const getMediaPermission = async () => {
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

            return true;
        } catch (err) {
            console.error(err);
            onError(err);
            return false;
        }
    };

    const startFaceDetection = () => {
        setRecordingStatus("calibrating");
        isCalibratingRef.current = true;

        const detect = () => {
            if (!videoRef.current || !canvasRef.current || !faceDetector.current) {
                if (isCalibratingRef.current) requestRef.current = requestAnimationFrame(detect);
                return;
            }

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

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

                    const rightDist = Math.hypot(rightEye.x - noseTip.x, rightEye.y - noseTip.y);
                    const leftDist = Math.hypot(leftEye.x - noseTip.x, leftEye.y - noseTip.y);
                    const symmetryRatio = Math.min(leftDist, rightDist) / Math.max(leftDist, rightDist);
                    
                    // Validations
                    const isLookingForward = symmetryRatio > 0.75;
                    const isCenteredX = Math.abs(centerX - 0.5) < 0.1;
                    const isCenteredY = Math.abs(centerY - 0.5) < 0.1;
                    const isRightSize = faceHeight > 0.4 && faceHeight < 0.65; 

                    // Generate specific guidance
                    let newGuidance = { text: "Detecting...", arrow: null };

                    if (!isLookingForward) {
                        if (leftDist > rightDist) {
                            newGuidance = { text: "Turn head slightly left", arrow: "TURN_LEFT" };
                        } else {
                            newGuidance = { text: "Turn head slightly right", arrow: "TURN_RIGHT" };
                        }
                    } else if (!isCenteredX) {
                        newGuidance = centerX < 0.4 
                            ? { text: "Move left", arrow: "MOVE_LEFT" } 
                            : { text: "Move right", arrow: "MOVE_RIGHT" };
                    } else if (!isCenteredY) {
                        newGuidance = centerY < 0.4 
                            ? { text: "Move down", arrow: "MOVE_DOWN" } 
                            : { text: "Move up", arrow: "MOVE_UP" };
                    } else if (!isRightSize) {
                        newGuidance = faceHeight < 0.4 
                            ? { text: "Move closer", arrow: "MOVE_CLOSER" } 
                            : { text: "Move further", arrow: "MOVE_FURTHER" };
                    } else {
                        newGuidance = { text: "Perfect! Hold still...", arrow: "READY" };
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
            
            onRecordingComplete({
                audioBlob: audioBlob,
                coordinates: coordinateTimeline.current
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
        videoRef, canvasRef, recordingStatus, isSteady, 
        isFaceCorrect, guidance, getMediaPermission, 
        startFaceDetection, startRecording, stopRecording
    };
};