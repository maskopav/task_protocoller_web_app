import React, { useState, useRef } from 'react';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import './VideoRecorder.css';

export const VideoRecorder = ({ title, instructions, onNextTask }) => {
    const [phase, setPhase] = useState('SETUP');
    const successAudio = useRef(new Audio('https://actions.google.com/sounds/v1/communication/notification_high_intensity.ogg'));

    const {
        videoRef,
        canvasRef,
        recordingStatus,
        isSteady,
        isFaceCorrect,
        faceMessage,
        getMediaPermission,
        startFaceDetection,
        startRecording,
        stopRecording
    } = useVideoRecorder({
        onRecordingComplete: (data) => {
            if (onNextTask) {
                onNextTask(data);
            }
        }
    });

    const handleStartCalibration = async () => {
        const hasPermission = await getMediaPermission();
        if (hasPermission) {
            setPhase('CALIBRATE');
            startFaceDetection();
        } else {
            console.error("Camera/Mic permission denied or failed.");
        }
    };

    const isReady = isSteady && isFaceCorrect;
    const showWarning = !isSteady || !isFaceCorrect;

    return (
        <div className="video-recorder-container">
            {/* Consistent Task Header */}
            <div className="task-header">
                <h2 className="task-title">{title}</h2>
                {instructions && <p className="task-instructions">{instructions}</p>}
            </div>
            
            <div className={`viewfinder-container ${(recordingStatus === 'recording' && showWarning) ? 'warning-border' : ''}`}>
                <video ref={videoRef} autoPlay playsInline muted className="viewfinder" />
                <canvas ref={canvasRef} className="mesh-canvas" />
                
                {phase === 'CALIBRATE' && (
                    <div className="calibration-overlay">
                        <div className={`face-oval ${isReady ? 'ready' : ''}`}></div>
                        <div className="warning-toast">
                            {faceMessage}
                        </div>
                    </div>
                )}

                {recordingStatus === 'recording' && showWarning && (
                    <div className="recording-alert-overlay">
                        <div className="alert-box">
                            ⚠️ {!isSteady ? "Hold Phone Steady!" : faceMessage}
                        </div>
                    </div>
                )}
            </div>
            
            <div className="controls-container">
                {phase === 'SETUP' && (
                    <button className="btn-primary" onClick={handleStartCalibration}>
                        Start Calibration
                    </button>
                )}
                
                {phase === 'CALIBRATE' && (
                    <button 
                        className="btn-primary" 
                        disabled={!isReady} 
                        onClick={() => { 
                            setPhase('RECORDING'); 
                            startRecording(); 
                            // Optional: play successAudio.current.play() here if desired
                        }}
                    >
                        {isReady ? "Start Recording" : "Awaiting Correct Position..."}
                    </button>
                )}

                {phase === 'RECORDING' && (
                    <button 
                        className="btn-primary btn-stop" 
                        onClick={() => { setPhase('DONE'); stopRecording(); }}
                    >
                        Stop Recording
                    </button>
                )}
                
                {phase === 'DONE' && (
                    <p className="completion-text">Recording Complete! Processing data...</p>
                )}
            </div>
        </div>
    );
};