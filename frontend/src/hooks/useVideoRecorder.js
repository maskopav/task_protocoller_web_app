// hooks/useVideoRecorder.js
import { useState, useRef, useEffect, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export const useVideoRecorder = (options = {}) => {
        const { onRecordingComplete = () => {}, onError = () => {} } = options;
    
        const [recordingStatus, setRecordingStatus] = useState("idle");
        const [isSteady, setIsSteady] = useState(false);
        const [isFaceCorrect, setIsFaceCorrect] = useState(false);
        const [faceMessage, setFaceMessage] = useState("Positioning...");
        
        // Guidance state for UI arrows
        const [guidance, setGuidance] = useState({ x: 0, y: 0, z: 0, roll: 0 }); // -1, 0, 1 for directions
    
        const videoRef = useRef(null);
        const canvasRef = useRef(null);
        const faceDetector = useRef(null);
        const requestRef = useRef(null);
        const lastDetectionTime = useRef(0);
        const MONITOR_INTERVAL_MS = 500; // Check twice per second for max efficiency
    
        const getMediaPermission = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
                );
                faceDetector.current = await FaceDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO"
                });
                const streamData = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                if (videoRef.current) videoRef.current.srcObject = streamData;
                return true;
            } catch (err) {
                onError(err);
                return false;
            }
        };
    
        const startFaceDetection = useCallback(() => {
            const detect = async () => {
                if (!videoRef.current || !faceDetector.current) return;
                const now = Date.now();
    
                if (now - lastDetectionTime.current > MONITOR_INTERVAL_MS && videoRef.current.readyState >= 2) {
                    lastDetectionTime.current = now;
                    const result = faceDetector.current.detectForVideo(videoRef.current, now);
                    const detections = result.detections;
    
                    if (detections.length > 0) {
                        const det = detections[0];
                        const box = det.boundingBox;
                        const keypoints = det.keypoints;
                        const vW = videoRef.current.videoWidth;
                        const vH = videoRef.current.videoHeight;
    
                        // 1. Centering Math
                        const faceCX = box.originX + box.width / 2;
                        const faceCY = box.originY + box.height / 2;
                        const diffX = faceCX - vW / 2;
                        const diffY = faceCY - vH / 2;
    
                        // 2. Rotation (Roll) Math - RESTORED
                        const eyeDiffY = keypoints[0].y - keypoints[1].y;
    
                        // 3. Size (Distance) Math
                        const sizeRatio = box.height / vH;
    
                        // Generate Guidance Logic
                        const newGuidance = {
                            x: Math.abs(diffX) > vW * 0.12 ? (diffX > 0 ? -1 : 1) : 0, // Move L/R
                            y: Math.abs(diffY) > vH * 0.15 ? (diffY > 0 ? 1 : -1) : 0,  // Move U/D
                            z: sizeRatio < 0.35 ? 1 : (sizeRatio > 0.6 ? -1 : 0),      // Closer/Away
                            roll: Math.abs(eyeDiffY) > 0.04 ? (eyeDiffY > 0 ? 1 : -1) : 0 // Level head
                        };
    
                        setGuidance(newGuidance);
                        
                        const isOk = Object.values(newGuidance).every(v => v === 0);
                        setIsFaceCorrect(isOk);
    
                        // User Messages
                        if (newGuidance.roll !== 0) setFaceMessage("Keep your head level");
                        else if (newGuidance.x !== 0) setFaceMessage("Center your head horizontally");
                        else if (newGuidance.y !== 0) setFaceMessage("Center your head vertically");
                        else if (newGuidance.z !== 0) setFaceMessage(newGuidance.z === 1 ? "Move closer" : "Move further away");
                        else setFaceMessage("Position OK");
    
                    } else {
                        setIsFaceCorrect(false);
                        setFaceMessage("Face lost!");
                        setGuidance({ x: 0, y: 0, z: 0, roll: 0 });
                    }
                }
                requestRef.current = requestAnimationFrame(detect);
            };
            requestRef.current = requestAnimationFrame(detect);
        }, []);
        
    const startRecording = () => {
        if (!stream) return;
        // NOTE: We no longer cancel the detection loop here!
        videoChunks.current = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') 
                         ? 'video/webm;codecs=vp8,opus' : 'video/mp4';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorder.current = recorder;
        recorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.current.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(videoChunks.current, { type: mimeType });
            setVideoURL(URL.createObjectURL(blob));
            onRecordingComplete(blob, URL.createObjectURL(blob));
        };
        recorder.start();
        setRecordingStatus("recording");
    };

    return {
        videoRef, recordingStatus, isSteady, 
        isFaceCorrect, faceMessage, getMediaPermission, 
        startFaceDetection, startRecording, stopRecording: () => {
            if (mediaRecorder.current) mediaRecorder.current.stop();
            setRecordingStatus("recorded");
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
    };
};