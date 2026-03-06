import React from 'react';
import { useTranslation } from "react-i18next";

// components/Recorder/RecordingControls.jsx - Control buttons component
export const RecordingControls = ({
    recordingStatus,
    permission,
    onStart,
    onPause,
    onResume,
    onStop,
    onPermission,
    disableControls = false,
    disableStop,
    showPause = true, // Pause button is shown by default
    RECORDING_STATES,
    className = "control-buttons"
}) => {
    const { t } = useTranslation();
    const { IDLE, RECORDING, PAUSED } = RECORDING_STATES;

    return (
    <div className={`controls ${className}`}>
        {/* Permission Button */}
        {!permission && (
            <button 
            onClick={onPermission}
            className="btn-permission"
            >
            {t("buttons.permission")}
            </button>
        )}

        {/* Recording Controls */}
        {permission && (
            <>
            {recordingStatus === IDLE && (
                <button onClick={onStart} className="btn-start">
                {t("buttons.start")}
                </button>
            )}

            {recordingStatus === RECORDING && !disableControls && (
                <div className="button-group">
                {showPause && (
                <button onClick={onPause} className="btn-pause">
                {t("buttons.pause")}
                </button>
                )}
                {!disableStop && (
                <button onClick={onStop} className="btn-stop">
                {t("buttons.stop")}
                </button>
                )}
                </div>
            )}

            {recordingStatus === PAUSED && !disableControls && (
                <div className="button-group">
                <button onClick={onResume} className="btn-resume">
                {t("buttons.resume")}
                </button>

                {!disableStop && (
                <button onClick={onStop} className="btn-stop">
                {t("buttons.stop")}
                </button>
                )}
                </div>
            )}
            </>
        )}
    </div>
    );
};
