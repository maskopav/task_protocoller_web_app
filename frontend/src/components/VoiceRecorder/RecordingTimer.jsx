import React from 'react';
import './VoiceRecorder.css';

// components/VoiceRecorder/RecordingTimer.jsx - Timer circle component
export const RecordingTimer = ({ 
    time, 
    remainingTime,
    status, 
    audioLevels = [], 
    showVisualizer = true,
    className = "",
    children
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
    const intensityScale = 1 + avgLevel / 140; // scaling factor for circle size
    const intensityOpacity = Math.min(0.2 + avgLevel / 200, 1); // glow visibility

    return (
        <div className="timer-wrapper" style={{ flexDirection: 'column' }}>
            <div className="timer-core">
                {/* Outer intensity circle */}
                {status === 'recording' && (
                    <div
                        className="intensity-circle"
                        style={{
                            transform: `scale(${intensityScale})`,
                            opacity: intensityOpacity,
                        }}
                    />
                )}

                {/* Timer circle */}
                <div className={`timer-circle ${status}`}>
                    <div className={`timer-display ${status === 'recording' ? 'recording' : ''}`}>
                        {remainingTime !== null ? formatTime(remainingTime) : formatTime(time)}
                    </div>
                </div>
            </div>

            {/* Extra control (e.g. play example button) */}
            {children && <div className="extra-control">{children}</div>}
        </div>
    );
};
