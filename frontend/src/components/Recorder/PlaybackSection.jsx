import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NextTaskButton } from "./NextTaskButton";

// components/Recorder/PlaybackSection.jsx - Audio playback component
export const PlaybackSection = ({ 
    audioURL, 
    recordingStatus, 
    onRepeat,
    onNextTask,
    showNextButton = true,
    onLogEvent = () => {} // For logging playback interactions
}) => {
    const { t } = useTranslation();
    const playbackStartTimeRef = useRef(null);

    // Clean up in case the user navigates away while the audio is still playing
    useEffect(() => {
        return () => {
            if (playbackStartTimeRef.current) {
                const durationListened = (Date.now() - playbackStartTimeRef.current) / 1000;
                onLogEvent("playback_interrupted", { durationListened });
            }
        };
    }, [onLogEvent]);

    // Only show playback section if recording is complete
    if (!audioURL) return null;

    const isRecorded = recordingStatus === 'recorded';

    const handlePlay = (e) => {
        playbackStartTimeRef.current = Date.now();
        onLogEvent("playback_started", { startTimeInAudio: e.target.currentTime });
    };

    const handlePause = (e) => {
        if (playbackStartTimeRef.current) {
            const durationListened = (Date.now() - playbackStartTimeRef.current) / 1000;
            playbackStartTimeRef.current = null; // reset the timer
            onLogEvent("playback_paused", { durationListened, stopTimeInAudio: e.target.currentTime });
        }
    };

    const handleEnded = (e) => {
        if (playbackStartTimeRef.current) {
            const durationListened = (Date.now() - playbackStartTimeRef.current) / 1000;
            playbackStartTimeRef.current = null; // reset the timer
            onLogEvent("playback_ended", { durationListened, stopTimeInAudio: e.target.currentTime });
        }
    };

    return (
        <div className="playback-section">
        <audio src={audioURL} controls onPlay={handlePlay} onPause={handlePause} onEnded={handleEnded} />
        
        <div className="button-group">
            <button onClick={onRepeat} className="btn-repeat">
            {t("buttons.repeat")}
            </button>

            {showNextButton && (
            <NextTaskButton 
                onClick={onNextTask} 
                disabled={!isRecorded} 
            />
            )}
        </div>
        </div>
    );
};
  

  