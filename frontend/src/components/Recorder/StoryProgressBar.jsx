import React, { useEffect, useRef } from 'react';

/**
 * StoryProgressBar
 *
 * Thin, minimalist line showing how much of the story clip has been
 * listened to. Reads audio.currentTime/duration directly via
 * requestAnimationFrame and writes straight to the DOM node's style,
 * bypassing React state/reconciliation — same pattern as RecordingTimer's
 * level meter — so it animates smoothly instead of looking stepped, the
 * way relying on the audio element's 'timeupdate' event would (that only
 * fires every ~250ms).
 *
 * audio: the live HTMLAudioElement (voiceRecorder.exampleAudio), or null
 * when nothing is currently playing. When it goes null the bar simply
 * freezes at its last position instead of resetting — so a finished or
 * manually-stopped clip still shows how far the participant got.
 */
export const StoryProgressBar = ({ audio }) => {
    const fillRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!audio) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            return;
        }

        const update = () => {
            const pct = audio.duration
                ? Math.min((audio.currentTime / audio.duration) * 100, 100)
                : 0;
            if (fillRef.current) {
                fillRef.current.style.width = `${pct}%`;
            }
            rafRef.current = requestAnimationFrame(update);
        };

        rafRef.current = requestAnimationFrame(update);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [audio]);

    return (
        <div className="story-progress-track" aria-hidden="true">
            <div className="story-progress-fill" ref={fillRef} />
        </div>
    );
};