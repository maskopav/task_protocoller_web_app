// frontend/src/components/Recorder/AudioExamplePlayer.jsx
import React, { forwardRef, useRef, useState, useEffect, useImperativeHandle } from 'react';
import { AudioExampleButton } from './AudioExampleButton';
import { StoryProgressBar } from './StoryProgressBar';

/**
 * AudioExamplePlayer
 *
 * Self-contained container for the "example"/"story" audio clip. Owns the
 * <audio> element and play/pause state directly (mirrors AudioGuidePlayer's
 * shape/pattern) instead of that living inside useVoiceRecorder — so Recorder
 * no longer needs to reach into the recording hook to control playback, and
 * the audio genuinely stops when this component unmounts (e.g. during video
 * calibration/permission phases, when the instructions card — and this
 * control along with it — is hidden).
 *
 * src              string | null   Audio file URL. Renders nothing if null.
 * variant          'example' | 'story'
 * recordingStatus  string          Forwarded to AudioExampleButton (disables while recording).
 * playTrigger      any             Changing this triggers autoplay (e.g. right after the guide ends).
 * resetTrigger     any             Changing this fully resets playback to 0 (e.g. on repeat/retry).
 * onThresholdReached func          (story only) Called once when a third of the clip has played.
 * onPlayingChange  func            Reports isPlaying up to the parent (e.g. so it can skip
 *                                  auto-play if the participant already started it manually).
 * onLogEvent       func
 */
export const AudioExamplePlayer = forwardRef(function AudioExamplePlayer({
    src,
    variant = 'example',
    recordingStatus,
    playTrigger,
    resetTrigger,
    onThresholdReached = () => {},
    onPlayingChange = () => {},
    onLogEvent = () => {},
}, ref) {
    const audioRef = useRef(null);
    const wrapperRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const thresholdFiredRef = useRef(false);

    // Mirrors AudioGuidePlayer's imperative stop() — lets Recorder silence
    // this clip synchronously, in the same click handler as Start, instead
    // of waiting on the outside-click listener or a reactive prop.
    useImperativeHandle(ref, () => ({
        stop: () => {
            if (audioRef.current) {
                // muted acts at the output-mixer stage, silencing whatever's
                // already queued in the hardware output buffer immediately —
                // pause() alone only stops feeding new audio into that queue.
                audioRef.current.muted = true;
                audioRef.current.pause();
            }
            setIsPlaying(false);
        }
    }), [variant]);

    useEffect(() => {
        onPlayingChange(isPlaying);
    }, [isPlaying, onPlayingChange]);

    // Global rule (same as AudioGuidePlayer): any click outside this control
    // while it's playing stops it. This is what covers "stop the story when
    // Start/Next/the audio guide/anything else is clicked" — none of those
    // need to know this component exists.
    useEffect(() => {
        if (!isPlaying) return undefined;

        const stopOnOutsideClick = (event) => {
            if (wrapperRef.current && wrapperRef.current.contains(event.target)) {
                return;
            }
            if (audioRef.current) {
                audioRef.current.muted = true;
                audioRef.current.pause();
            }
            setIsPlaying(false);
        };

        document.addEventListener('click', stopOnOutsideClick, true);
        return () => document.removeEventListener('click', stopOnOutsideClick, true);
    }, [isPlaying]);

    // Forced autoplay when playTrigger changes — skip the value present at mount.
    const prevPlayTriggerRef = useRef(playTrigger);
    useEffect(() => {
        if (playTrigger === prevPlayTriggerRef.current) return;
        prevPlayTriggerRef.current = playTrigger;
        if (audioRef.current) {
            audioRef.current.muted = false;
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(() => setIsPlaying(false));
        }
    }, [playTrigger]);

    // Forced full reset when resetTrigger changes — skip the value present at mount.
    const prevResetTriggerRef = useRef(resetTrigger);
    useEffect(() => {
        if (resetTrigger === prevResetTriggerRef.current) return;
        prevResetTriggerRef.current = resetTrigger;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.muted = false;
        }
        setIsPlaying(false);
        thresholdFiredRef.current = false;
    }, [resetTrigger]);

    // Deterministic stop on unmount, rather than relying on browser behavior
    // for detached media elements.
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.muted = true;
                audioRef.current.pause();
            }
        };
    }, []);

    const handleToggle = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            onLogEvent(variant === 'story' ? 'button_stop_story' : 'button_stop_example');
            audio.muted = true;
            audio.pause();
            setIsPlaying(false);
        } else {
            onLogEvent(variant === 'story' ? 'button_play_story' : 'button_play_example');
            audio.muted = false;
            audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
    };

    const handleTimeUpdate = () => {
        const audio = audioRef.current;
        if (variant !== 'story' || thresholdFiredRef.current || !audio?.duration) return;
        if (audio.currentTime >= audio.duration / 3) {
            thresholdFiredRef.current = true;
            onThresholdReached();
        }
    };

    const handleEnded = () => setIsPlaying(false);

    if (!src) return null;

    return (
        <div
            className={`instruction-example-row ${variant === 'story' ? 'instruction-example-row--story' : ''}`}
            ref={wrapperRef}
        >
            <AudioExampleButton
                recordingStatus={recordingStatus}
                audioExample={src}
                isPlaying={isPlaying}
                onToggle={handleToggle}
                variant={variant}
            />
            {variant === 'story' && (
                <StoryProgressBar audio={audioRef.current} />
            )}
            <audio
                ref={audioRef}
                src={src}
                preload="auto"
                onEnded={handleEnded}
                onTimeUpdate={handleTimeUpdate}
            />
        </div>
    );
});