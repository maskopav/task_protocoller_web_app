import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NextTaskButton } from "./NextTaskButton";
import { SafeButton } from '../Shared/SafeButton';

// components/Recorder/PlaybackSection.jsx - Audio playback component
export const PlaybackSection = ({ 
    audioURL, 
    recordingStatus, 
    onRepeat,
    onNextTask,
    showNextButton = true,
    isUploading = false,
    onLogEvent = () => {},
    onPlaybackStart = () => {}
}) => {
    const { t } = useTranslation();
    const playbackStartTimeRef = useRef(null);
    const audioCtxRef = useRef(null); // Tracks the playback AudioContext

    // Clean up in case the user navigates away while the audio is still playing
    useEffect(() => {
        return () => {
            if (playbackStartTimeRef.current) {
                const durationListened = (Date.now() - playbackStartTimeRef.current) / 1000;
                onLogEvent("playback_interrupted", { durationListened });
            }
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                audioCtxRef.current.close().catch(() => {});
            }
        };
    }, [onLogEvent]);

    // Only show playback section if recording is complete
    if (!audioURL) return null;

    const isRecorded = recordingStatus === 'recorded';

    const handlePlay = (e) => {
        onPlaybackStart(); // stop any audio guide still playing so it doesn't overlap
        playbackStartTimeRef.current = Date.now();
        onLogEvent("playback_started", { startTimeInAudio: e.target.currentTime });

        // Apply dynamic volume boost during playback for iOS devices
        if (!audioCtxRef.current) {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioCtxRef.current = new AudioContextClass();
                
                const source = audioCtxRef.current.createMediaElementSource(e.target);
                const gainNode = audioCtxRef.current.createGain();
                
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.maxTouchPoints > 0;
                gainNode.gain.value = isIOS ? 3.0 : 1.0; // Boost only on iOS
                
                source.connect(gainNode);
                gainNode.connect(audioCtxRef.current.destination);
            } catch (err) {
                console.warn("Could not boost playback volume:", err);
            }
        }
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
            <audio src={audioURL} controls onPlay={handlePlay} onPause={handlePause} onEnded={handleEnded} crossOrigin="anonymous" />

            <div className="button-group">
                <SafeButton onClick={onRepeat} className="btn-repeat" disabled={isUploading}>
                    {t("buttons.repeat")}
                </SafeButton>

                {showNextButton && (
                    <NextTaskButton 
                        onClick={onNextTask} 
                        disabled={!isRecorded}
                        isLoading={isUploading}
                    />
                )}
            </div>
        </div>
    );
};