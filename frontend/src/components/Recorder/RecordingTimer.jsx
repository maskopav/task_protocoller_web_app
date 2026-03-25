import React from 'react';
import './Recorder.css';

// components/Recorder/RecordingTimer.jsx - Timer circle component
export const RecordingTimer = ({ 
    time, 
    remainingTime,
    status, 
    audioLevels = [], 
    showVisualizer = true,
    isReadyToStop = false,
    showMicIcon = false
}) => {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const avgLevel = audioLevels.length
        ? audioLevels.reduce((a,b) => a+b, 0) / audioLevels.length
        : 0;

    const baseScale = 1.02 + (avgLevel / 10); 
    const intensityScale = Math.min(baseScale, 1.45); 
    const intensityOpacity = Math.min(0.2 + (avgLevel / 7), 0.85);
    
    // This class determines if the timer (and now the mic) should turn green
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
                        {showMicIcon ? (
                            <div className="mic-icon-mask" />
                        ) : (
                            remainingTime !== null ? formatTime(remainingTime) : formatTime(time)
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};