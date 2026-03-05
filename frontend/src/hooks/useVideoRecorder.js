import { useState, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const DEV_MODE = true; // Set to false when deploying
const FRAME_RATE_MS = 33;

export const useVideoRecorder = (options = {}) => {
    const { onRecordingComplete = () => {}, onError = () => {} } = options;

    const [recordingStatus, setRecordingStatus] = useState("idle");
    const [isSteady, setIsSteady] = useState(false);
    const [isFaceCorrect, setIsFaceCorrect] = useState(false);
    const [faceMessage, setFaceMessage] = useState("Positioning...");
    
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

                    if (DEV_MODE) {
                        ctx.fillStyle = "#ffffff"; 
                        for (const point of landmarks) {
                            ctx.beginPath();
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

                    const isCentered = Math.abs(centerX - 0.5) < 0.1 && Math.abs(centerY - 0.5) < 0.1;
                    const isRightSize = faceHeight > 0.4 && faceHeight < 0.65; 

                    if (isCentered && isRightSize) {
                        setIsFaceCorrect(true); 
                        setIsSteady(true); 
                        setFaceMessage("Perfect! Hold still...");
                    } else {
                        setIsFaceCorrect(false);
                        setIsSteady(false);
                        setFaceMessage(!isCentered ? "Center your face in the oval" : "Move closer or further away");
                    }
                } else {
                    setIsFaceCorrect(false);
                    setIsSteady(false);
                    setFaceMessage("No face detected. Look at the camera.");
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
        isFaceCorrect, faceMessage, getMediaPermission, 
        startFaceDetection, startRecording, stopRecording
    };
};