import React from 'react';
import './Recorder.css';

// components/Recorder/RecordingTimer.jsx - Timer circle component
export const RecordingTimer = ({ 
    time, 
    remainingTime,
    status, 
    audioLevels = [], 
    showVisualizer = true,
    isReadyToStop = false
}) => {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Compute intensity from audioLevels (0-100)
    const avgLevel = audioLevels.length
        ? audioLevels.reduce((a,b) => a+b, 0) / audioLevels.length
        : 0;

    // This makes quiet laptop sounds (e.g., level 4) scale up fast (sqrt(4) = 2), 
    // but keeps loud phone sounds (e.g., level 64) from breaking the screen (sqrt(64) = 8).
    const baseScale = 1 + (Math.sqrt(avgLevel) / 3.8);
    const intensityScale = Math.min(baseScale, 2.5);
    
    // Make the opacity slightly stronger so it's easier for elderly eyes to see
    const intensityOpacity = Math.min(0.2 + (avgLevel / 50), 0.85);

    // Determine the color class based on the prop
    const readyClass = isReadyToStop ? "ready-to-stop" : "";

    return (
        <div className={`timer-wrapper ${status}`} style={{ flexDirection: 'column' }}>
            <div className={`timer-core ${status}`}>
                {/* Outer intensity circle */}
                {status === 'recording' && showVisualizer &&(
                    <div
                        className={`intensity-circle ${readyClass}`}
                        style={{
                            transform: `scale(${intensityScale})`,
                            opacity: intensityOpacity,
                        }}
                    />
                )}

                {/* Timer circle */}
                <div className={`timer-circle ${status} ${readyClass}`}>
                    <div className={`timer-display ${status === 'recording' ? 'recording' : ''}`}>
                        {remainingTime !== null ? formatTime(remainingTime) : formatTime(time)}
                    </div>
                </div>
            </div>
        </div>
    );
};
