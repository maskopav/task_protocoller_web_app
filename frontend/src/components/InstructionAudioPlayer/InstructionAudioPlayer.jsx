import React, { useRef, useState, useEffect } from 'react';
import './InstructionAudioPlayer.css';
import pauseIcon from '../../assets/audioIcons/pause-icon.svg';
import speakerIcon from '../../assets/audioIcons/audio-example-icon.svg';

/**
 * InstructionAudioPlayer
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
 *     <InstructionAudioPlayer
 *       src={audioSrc}
 *       taskIndex={taskIndex}
 *       isRecordingActive={isRecordingActive}
 *     />
 *   </div>
 */
export default function InstructionAudioPlayer({ src, taskIndex, isRecordingActive }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);

  // Reset availability whenever the source changes (new task)
  useEffect(() => {
    setAudioAvailable(true);
  }, [src]);

  // Auto-play when a new task with audio is shown
  useEffect(() => {
    if (!src || !audioRef.current) return;

    let isCancelled = false;
    const audio = audioRef.current;
    audio.currentTime = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (isCancelled) return;
        if (err.name !== 'AbortError') {
          console.warn('Autoplay blocked by browser:', err);
          setIsPlaying(false);
        }
      });
    }

    return () => {
      isCancelled = true;
      audio.pause();
    };
  }, [src, taskIndex]);

  // Stop the moment recording begins
  useEffect(() => {
    if (isRecordingActive && audioRef.current) {
      audioRef.current.pause();
    }
  }, [isRecordingActive]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(e => console.warn('Cannot play audio:', e));
    } else {
      audioRef.current.pause();
    }
  };

  // Hidden when there is no audio, the file failed to load, or recording is underway
  if (!src || !audioAvailable || isRecordingActive) return null;

  return (
    <>
      <button
        className="audio-instructions-btn"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause instructions' : 'Play instructions'}
        title={isPlaying ? 'Pause instructions' : 'Play instructions'}
      >
        <img
          src={isPlaying ? pauseIcon : speakerIcon}
          alt=""
          className="audio-instructions-icon"
        />
      </button>

      <audio
        className="audio-instructions-audio"
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => { setIsPlaying(false); setAudioAvailable(false); }}
      />
    </>
  );
}

