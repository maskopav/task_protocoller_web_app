import React from 'react';

export const VideoViewfinder = ({ 
    phase, 
    videoRecorder, 
    isRecording 
}) => {
    // Destructure what we need from the hook to keep the JSX clean
    const { 
        videoRef, 
        canvasRef, 
        isSteady, 
        isFaceCorrect, 
        guidance, 
        faceMessage 
    } = videoRecorder;

    // Calculate the warning state once
    const showWarningBorder = isRecording && (!isSteady || !isFaceCorrect);

    return (
        <div className={`viewfinder-container ${phase === 'RECORDING' ? 'pip-mode' : ''} ${showWarningBorder ? 'warning-border' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted className="viewfinder" />
            
            {phase === 'CALIBRATE' && (
                <canvas ref={canvasRef} className="mesh-canvas" />
            )}

            {/* Calibration Overlay */}
            {phase === 'CALIBRATE' && (
                <div className="calibration-overlay">
                    <div className={`face-oval ${isSteady && isFaceCorrect ? 'ready' : ''}`}>
                        {guidance?.arrow === 'MOVE_UP' && <div className="calib-icon icon-up">⇧</div>}
                        {guidance?.arrow === 'MOVE_DOWN' && <div className="calib-icon icon-down">⇩</div>}
                        {guidance?.arrow === 'MOVE_LEFT' && <div className="calib-icon icon-left">⇦</div>}
                        {guidance?.arrow === 'MOVE_RIGHT' && <div className="calib-icon icon-right">⇨</div>}
                        {guidance?.arrow === 'READY'}
                    </div>
                    <div className="warning-toast">
                        {guidance?.text}
                    </div>
                </div>
            )}

            {/* Recording Phase Warning Overlay */}
            {phase === 'RECORDING' && showWarningBorder && (
                <div className="recording-alert-overlay">
                    <div className="alert-box">
                        ⚠️ {!isSteady ? "Hold Phone Steady!" : (faceMessage || "Adjust your face!")}
                    </div>
                </div>
            )}
        </div>
    );
};