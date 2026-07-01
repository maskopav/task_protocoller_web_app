import React, { useRef, useEffect } from 'react';
import micIcon from "../../assets/audioIcons/mic-icon-black.svg";
import './Recorder.css';

// components/Recorder/RecordingTimer.jsx - Timer circle component
//
// The intensity circle is driven by a dedicated rAF loop instead of React's
// render cycle. audioLevels arrives as a prop (so React still re-renders on
// each tick), but that render is now cheap: the level math and inline-style
// object creation have been moved out of JSX and into a ref-driven loop that
// writes straight to the DOM node, capped at ~30fps. See note at the bottom
// on removing the residual re-render entirely.
const FRAME_INTERVAL_MS = 1000 / 30;

export const RecordingTimer = ({
    time,
    remainingTime,
    status,
    audioLevelsRef,
    showVisualizer = true,
    isReadyToStop = false,
    showMicIcon = false,
    visualPhase
}) => {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // This class determines if the timer (and now the mic) should turn green
    const readyClass = isReadyToStop ? "ready-to-stop" : "";

    // ── DOM node written to directly, bypassing React reconciliation ────────
    const intensityCircleRef = useRef(null);

    // ── Rolling auto-calibration: floor tracks ambient noise, ceiling tracks
    // recent peaks, so the 0→1 range adapts to whatever this device/mic
    // actually produces instead of assuming fixed constants. ────────────────
    const calibRef = useRef({ floor: null, ceiling: null });

    useEffect(() => {
        if (status !== 'recording' || !showVisualizer) return;

        let rafId;
        let lastFrameTime = 0;

        const tick = (now) => {
            rafId = requestAnimationFrame(tick);

            // Cap the actual work to ~30fps regardless of display refresh rate
            if (now - lastFrameTime < FRAME_INTERVAL_MS) return;
            lastFrameTime = now;

            const node = intensityCircleRef.current;
            if (!node) return;

            const levels = audioLevelsRef?.current ?? [];
            const avgLevel = levels.length
                ? levels.reduce((a, b) => a + b, 0) / levels.length
                : 0;

            const calib = calibRef.current;
            if (calib.floor === null) {
                // Seed calibration from the first real sample of the session
                // rather than guessing a fixed starting scale.
                calib.floor = avgLevel;
                calib.ceiling = avgLevel + 1;
            }

            // Floor: tracks downward quickly (find "quiet"), drifts upward very
            // slowly (so a session that gets ambiently noisier still adapts).
            calib.floor = avgLevel < calib.floor
                ? calib.floor * 0.95 + avgLevel * 0.05
                : calib.floor * 0.999 + avgLevel * 0.001;

            // Ceiling: snaps up instantly on a new peak, decays slowly
            // otherwise — so one loud moment doesn't permanently desensitize
            // the scale for the rest of the recording.
            calib.ceiling = avgLevel > calib.ceiling
                ? avgLevel
                : calib.ceiling * 0.995 + avgLevel * 0.005;

            const range = Math.max(calib.ceiling - calib.floor, 1e-6);
            const normalized = Math.min(Math.max((avgLevel - calib.floor) / range, 0), 1);

            const scale = 1.02 + normalized * (1.45 - 1.02);
            const opacity = 0.2 + normalized * (0.85 - 0.2);

            node.style.transform = `scale(${scale})`;
            node.style.opacity = opacity;
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [status, showVisualizer]);

    // Reset calibration for each fresh recording so a loud first session
    // doesn't linger and desensitize the next one.
    useEffect(() => {
        if (status !== 'recording') {
            calibRef.current = { floor: null, ceiling: null };
        }
    }, [status]);

    return (
        <div className={`timer-wrapper ${status} phase-${visualPhase}`} style={{ flexDirection: 'column' }}>
            <div className={`timer-core ${status}`}>
                {/* Outer intensity circle — style is set imperatively by the rAF loop above */}
                {status === 'recording' && showVisualizer && (
                    <div
                        ref={intensityCircleRef}
                        className={`intensity-circle ${readyClass}`}
                    />
                )}

                {/* Timer circle */}
                <div className={`timer-circle ${status} ${readyClass}`}>
                    <div className={`timer-display ${status === 'recording' ? 'recording' : ''}`}>
                        {showMicIcon ? (
                            <img src={micIcon} className="mic-icon-display" alt="Microphone Indicator" />
                        ) : (
                            remainingTime !== null ? formatTime(remainingTime) : formatTime(time)
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
