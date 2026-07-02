import React, { useRef, useState, useEffect } from 'react';
import './AudioGuidePlayer.css';
import speakerIcon from '../../assets/audioIcons/audio-guide-icon.svg';

/**
 * AudioGuidePlayer
 *
 * Renders a bare icon button that plays / pauses the task instruction audio.
 * All audio state is self-contained — the parent only needs to supply:
 *
 *   src              string | null   Audio file URL. Pass null to hide entirely.
 *   taskIndex        number          Current task index. Changing it re-triggers
 *                                   autoplay even when src stays the same.
 *   isRecordingActive bool           While true, audio is paused and button hidden.
 *
 * Usage in ParticipantInterfacePage:
 *
 *   <div className="task-header-right">
 *     <AudioGuidePlayer
 *       src={audioSrc}
 *       taskIndex={taskIndex}
 *       isRecordingActive={isRecordingActive}
 *     />
 *   </div>
 */
export default function AudioGuidePlayer({ src, playTrigger, isRecordingActive }) {
  const audioRef = useRef(null);
  const buttonRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  console.log(src)

  // Global rule: any click outside this button while the guide is playing
  // should stop it. Clicks on the button itself are left alone since
  // handleTogglePlay already covers play/pause for that case.
  useEffect(() => {
    if (!isPlaying) return undefined;

    const stopOnOutsideClick = (event) => {
      if (buttonRef.current && buttonRef.current.contains(event.target)) {
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    };

    // Capture phase so this still fires even if a button's own handler
    // calls stopPropagation().
    document.addEventListener('click', stopOnOutsideClick, true);
    return () => document.removeEventListener('click', stopOnOutsideClick, true);
  }, [isPlaying]);

  // Reset error state whenever a new src is provided
  useEffect(() => {
    setHasError(false);
  }, [src, playTrigger]);

  // Stop playing if recording becomes active
  useEffect(() => {
    if (isRecordingActive && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isRecordingActive]);

  // Only replays when playTrigger changes
  useEffect(() => {
    if (!src || !audioRef.current || isRecordingActive) return;

    const audio = audioRef.current;
    audio.currentTime = 0;

    const playOnLoad = () => {
      audio.play().then(() => setIsPlaying(true)).catch(() => {
        setIsPlaying(false);
        setHasError(true);
      });
    } 

    if (audio.readyState >= 2) {
      playOnLoad();
    } else {
      audio.addEventListener('canplaythrough', playOnLoad, { once: true });
    }

    return () => {
      audio.pause();
      setIsPlaying(false);
      audio.removeEventListener('canplaythrough', playOnLoad);
    };
  }, [playTrigger, isRecordingActive]);

  const handleAudioError = () => {
    setHasError(true);
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  if (!src || isRecordingActive || hasError) {
    return null;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`audio-instructions-btn ${
          isPlaying ? 'is-playing' : 'is-paused'
        }`}
        onClick={handleTogglePlay}
        aria-label={isPlaying ? 'Pause audio guide' : 'Play audio guide'}
      >
        <div className="audio-instructions-visual">
          <img
            src={speakerIcon}
            alt=""
            aria-hidden="true"
            className="audio-instructions-speaker"
          />
          <div
            className={`audio-waves ${
              isPlaying ? 'audio-waves--active' : ''
            }`}
          >
            <span className="audio-wave audio-wave--1" />
            <span className="audio-wave audio-wave--2" />
            <span className="audio-wave audio-wave--3" />
          </div>
        </div>
      </button>

      <audio
        ref={audioRef}
        src={src}
        className="audio-instructions-audio"
        onEnded={handleEnded}
        onError={handleAudioError}
      />
    </>
  );
}
