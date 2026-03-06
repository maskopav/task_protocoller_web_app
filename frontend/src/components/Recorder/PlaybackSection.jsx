import React from "react";
import { useTranslation } from "react-i18next";
import { NextTaskButton } from "./NextTaskButton";

// components/Recorder/PlaybackSection.jsx - Audio playback component
export const PlaybackSection = ({ 
    audioURL, 
    recordingStatus, 
    onRepeat,
    onNextTask,
    showNextButton = true
}) => {
    const { t } = useTranslation();
    // Only show playback section if recording is complete
    if (!audioURL) return null;

    const isRecorded = recordingStatus === 'recorded';

    return (
        <div className="playback-section">
        <audio src={audioURL} controls />
        
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
  

  