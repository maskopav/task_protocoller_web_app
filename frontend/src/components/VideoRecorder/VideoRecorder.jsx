// components/VideoRecorder/VideoRecorder.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import './VideoRecorder.css';

export const VideoRecorder = ({ title, instructions, onNextTask }) => {
    const [phase, setPhase] = useState('SETUP');
    const successAudio = useRef(new Audio('https://actions.google.com/sounds/v1/communication/notification_high_intensity.ogg'));

    const {
        videoRef,
        recordingStatus,
        isSteady,
        isFaceCorrect,
        faceMessage,
        getMediaPermission,
        startFaceDetection,
        startRecording,
        stopRecording
    } = useVideoRecorder();

    const handleStartCalibration = async () => {
        console.log("DEBUG: 'Start Calibration' button clicked");
        const hasPermission = await getMediaPermission();
        
        if (hasPermission) {
            console.log("DEBUG: Permission granted, moving to CALIBRATE phase");
            setPhase('CALIBRATE');
            startFaceDetection();
        } else {
            console.error("DEBUG: Permission denied or failed");
        }
    };

    const isReady = isSteady && isFaceCorrect;
    const showWarning = !isSteady || !isFaceCorrect;

    return (
        <div className="video-recorder-container">
            <h1>{title}</h1>
            
            <div className={`viewfinder-container ${(recordingStatus === 'recording' && showWarning) ? 'warning-border' : ''}`}>
                <video ref={videoRef} autoPlay playsInline muted className="viewfinder" />
                
                {/* 1. Calibration Overlay (Only in CALIBRATE phase) */}
                {phase === 'CALIBRATE' && (
                    <div className="overlay">
                         <svg className="face-frame">...</svg>
                         <div className="warning-toast">{faceMessage}</div>
                    </div>
                )}

                {/* 2. Persistent Recording Warning (In RECORDING phase) */}
                {recordingStatus === 'recording' && showWarning && (
                    <div className="recording-alert-overlay">
                        <div className="alert-box">
                            ⚠️ {!isSteady ? "Hold Phone Steady!" : faceMessage}
                        </div>
                    </div>
                )}
            </div>
            <div className="controls">
                {phase === 'SETUP' && <button className="btn-primary" onClick={handleStartCalibration}>Start Calibration</button>}
                {phase === 'CALIBRATE' && (
                    <button className="btn-primary" disabled={!isReady} onClick={() => { setPhase('RECORDING'); startRecording(); }}>
                        {isReady ? "Start Recording" : "Awaiting Correct Position..."}
                    </button>
                )}
            </div>
        </div>
    );
};