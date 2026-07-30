import React, { useEffect, useRef } from 'react';
import './ProgressBar.css';

export const ProgressBar = ({ audio, duration, currentTime, isRunning, percentage, variant = 'default' }) => {
    const fillRef = useRef(null);
    const rafRef = useRef(null);

    // Wall-clock instant that corresponds to currentTime === 0.
    // Recomputed from real data every time we get some (a tick, or a
    // resume from pause) — the animation is always anchored to reality
    // instead of a guessed tick length, so there's nothing to mispredict
    // and nothing that can plateau while waiting for a guess to catch up.
    const originRef = useRef(performance.now() - (currentTime ?? 0) * 1000);

    useEffect(() => {
        if (isRunning) {
            originRef.current = performance.now() - (currentTime ?? 0) * 1000;
        }
    }, [currentTime, isRunning]);

    useEffect(() => {
        // MODE 1: Audio Playback
        if (audio) {
            const updateAudio = () => {
                const pct = audio.duration ? Math.min((audio.currentTime / audio.duration) * 100, 100) : 0;
                if (fillRef.current) fillRef.current.style.width = `${pct}%`;
                rafRef.current = requestAnimationFrame(updateAudio);
            };
            rafRef.current = requestAnimationFrame(updateAudio);
            return () => cancelAnimationFrame(rafRef.current);
        }

        // MODE 2: Hook-synchronized playback, interpolated continuously from real elapsed time
        if (duration > 0 && currentTime !== undefined) {
            const updateTimer = () => {
                const elapsed = isRunning
                    ? (performance.now() - originRef.current) / 1000
                    : currentTime;

                const pct = Math.min(Math.max((elapsed / duration) * 100, 0), 100);
                if (fillRef.current) fillRef.current.style.width = `${pct}%`;

                if (isRunning) {
                    rafRef.current = requestAnimationFrame(updateTimer);
                }
            };

            rafRef.current = requestAnimationFrame(updateTimer);
            return () => cancelAnimationFrame(rafRef.current);
        }

        // MODE 3: Static Manual Percentage fallback
        if (percentage !== undefined && fillRef.current && !duration) {
            const safePct = Math.min(Math.max(percentage, 0), 100);
            fillRef.current.style.width = `${safePct}%`;
        }
    }, [audio, duration, currentTime, isRunning, percentage]);

    return (
        <div className={`progress-track progress-variant-${variant}`} aria-hidden="true">
            <div className="progress-fill" ref={fillRef} />
        </div>
    );
};
