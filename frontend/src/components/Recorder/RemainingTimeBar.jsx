import React, { useRef, useEffect } from 'react';
import './Recorder.css';

// Thin progress bar that fills 0→100% over `durationMs`, anchored to a
// wall clock captured once on mount. Same minimalist look as StoryProgressBar
// (reuses .story-progress-track / .story-progress-fill), but timed by Date.now()
// instead of an <audio> element — the countdown recorder only exposes a 1 Hz
// remainingTime, so a RAF clock is what keeps the fill smooth.
export const RemainingTimeBar = ({ durationMs }) => {
    const fillRef = useRef(null);
    // Capture once on mount so the parent's per-second re-renders can't reset it.
    const totalMsRef = useRef(durationMs);
    const startRef = useRef(Date.now());

    useEffect(() => {
        const total = totalMsRef.current;
        if (!total) return;

        let rafId;
        const update = () => {
            const pct = Math.min((Date.now() - startRef.current) / total, 1) * 100;
            if (fillRef.current) fillRef.current.style.width = `${pct}%`;
            if (pct < 100) rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return (
        <div className="story-progress-track remaining-time-track" aria-hidden="true">
            <div className="story-progress-fill" ref={fillRef} />
        </div>
    );
};