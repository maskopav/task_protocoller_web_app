import React from 'react';
import { useTranslation } from "react-i18next";
import { SafeButton } from '../Shared/SafeButton';

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
    disableStart = false,
    showPause = true, // Pause button is shown by default
    RECORDING_STATES,
    className = "control-buttons",
    isVideoEnabled = false,
    videoCalibrated = false,
    isPreparingToRecord = false,
    showRevealTopic = false,
    onRevealTopic
}) => {
    const { t } = useTranslation();
    const { IDLE, RECORDING, PAUSED } = RECORDING_STATES;

    return (
    <div className={`controls ${className}`}>
        {/* Permission Button */}
        {!permission && (
            <SafeButton 
            onClick={onPermission}
            className="btn-permission"
            >
            {t("buttons.permission")}
            </SafeButton>
        )}

        {/* Recording Controls */}
        {permission && (
            <>
            {recordingStatus === IDLE && (showRevealTopic ? (
                // Split instruction pack: reveal the topic before Start appears
                <SafeButton onClick={onRevealTopic} className="btn-start">
                    {t("buttons.seeTopic")}
                </SafeButton>
            ) : (
                <SafeButton 
                    onClick={onStart}
                    className={`btn-start ${disableStart ? 'disabled' : ''}`}
                    disabled={disableStart}
                >
                {isPreparingToRecord ? (
                    <>
                    <span className="spinner" />
                    {t("buttons.preparing")}
                    </>
                ) : (
                    // Video task not yet calibrated (retry path) → back to calibration first
                    isVideoEnabled && !videoCalibrated
                        ? t("buttons.startCalibration")
                        : t("buttons.start")
                )}
                </SafeButton>
            ))}

            {recordingStatus === RECORDING && !disableControls && (
                <div className="button-group">
                {showPause && (
                <SafeButton onClick={onPause} className="btn-pause">
                {t("buttons.pause")}
                </SafeButton>
                )}

                <SafeButton onClick={onStop} className={`btn-stop ${disableStop ? 'disabled' : ''}`} disabled={disableStop}>
                {t("buttons.stop")}
                </SafeButton>
                </div>
            )}

            {recordingStatus === PAUSED && !disableControls && (
                <div className="button-group">
                <SafeButton onClick={onResume} className="btn-resume">
                {t("buttons.resume")}
                </SafeButton>

                <SafeButton onClick={onStop} className={`btn-stop ${disableStop ? 'disabled' : ''}`} disabled={disableStop}>
                {t("buttons.stop")}
                </SafeButton>
                </div>
            )}
            </>
        )}
    </div>
    );
};
