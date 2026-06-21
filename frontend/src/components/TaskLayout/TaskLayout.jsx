import React, { useEffect, useRef, useState } from 'react';
import { useTaskAudio } from '../../context/TaskAudioContext';
import './TaskLayout.css';

/**
 * TaskLayout — the standard 3-zone shell for every assessment task.
 *
 * ┌──────────────────────────────────────────────┐
 * │  HEADER  · <h1> title + optional tooltip     │
 * │           · optional .flexible-spacer        │
 * │           · optional instruction-card        │
 * ├──────────────────────────────────────────────┤
 * │  MAIN    · .recording-area  (children)       │
 * ├──────────────────────────────────────────────┤
 * │  CONTROLS · .bottom-controls  (controls)     │
 * └──────────────────────────────────────────────┘
 *
 * Audio is sourced from TaskAudioContext — set it at the page level via
 * <TaskAudioProvider src="...">. No audio prop is needed on TaskLayout itself.
 *
 * ── Props ──────────────────────────────────────────────────────────────
 *
 * CONTAINER
 *   className         string   Extra modifier classes on .task-container
 *
 * HEADER
 *   title             node     <h1> content; pass null to skip the <h1> entirely
 *   tooltip           node     Rendered inside <h1> after the title text
 *   headerClassName   string   Extra classes on .task-header
 *   showSpacer        bool     Renders .flexible-spacer between <h1> and instructions
 *   instructions      node     Fills the .instruction-card; null hides the card
 *   instructionsClassName  string  Extra classes on the instruction-card div
 *   instructionsKey   any      React key on the instruction card (triggers re-mount
 *                              animation when the key changes, e.g. for dynamic tasks)
 *
 * PRE-HEADER SLOT
 *   preHeader         node     Rendered before .task-header — used by Recorder when
 *                              hideTitle=true shifts the timer above the header
 *
 * MAIN SLOT
 *   children          node     Fills .recording-area
 *   mainClassName     string   Extra classes on .recording-area
 *
 * CONTROLS SLOT
 *   controls          node     Fills .bottom-controls
 *   controlsClassName string   Extra classes on .bottom-controls
 */

const SHOW_GLOBAL_TITLES = false;

export default function TaskLayout({
  // container
  className = '',

  // header
  title                 = null,
  tooltip               = null,
  headerClassName       = '',
  showSpacer            = false,
  instructions          = null,
  instructionsClassName = '',
  instructionsKey       = undefined,

  // pre-header slot
  preHeader = null,

  // main slot
  children      = null,
  mainClassName = '',

  // controls slot
  controls          = null,
  controlsClassName = '',
}) {
  const cx = (...parts) => parts.filter(Boolean).join(' ');

  // Read audio src from context — provided by TaskAudioProvider at the page level
  const autoAudioSrc = useTaskAudio();

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const shouldRenderTitle = title != null && SHOW_GLOBAL_TITLES;

  // Auto-play logic
  useEffect(() => {
    if (!autoAudioSrc || !audioRef.current || instructions == null) return;

    let isCancelled = false; // Flag to prevent race conditions
    const audio = audioRef.current;

    // React already updates the src in the DOM, so forcing .load() here 
    // is what causes the AbortError during fast re-renders. 
    audio.currentTime = 0;

    // .play() returns a Promise. We must handle it!
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        if (isCancelled) return; // Ignore errors if we moved to the next task

        if (error.name === 'AbortError') {
          // Normal behavior during fast task switching; ignore quietly.
          console.debug("Audio playback was cleanly interrupted.");
        } else if (error.name === 'NotSupportedError') {
          console.warn(`Audio file missing or invalid format at: ${autoAudioSrc}`);
          setIsPlaying(false);
        } else {
          console.warn('Autoplay blocked by browser. User must click play.', error);
          setIsPlaying(false);
        }
      });
    }

    // CLEANUP: If the user clicks "Next Task" while audio is playing,
    // this cancels the promise and pauses the old audio.
    return () => {
      isCancelled = true;
      audio.pause();
    };
  }, [autoAudioSrc, instructionsKey, instructions]);

  // Manual play/pause toggle
  const toggleAudio = () => {
    if (!audioRef.current) return;
    
    // Safely attempt to play/pause manually
    if (audioRef.current.paused) {
      audioRef.current.play().catch(e => console.warn("Cannot play audio:", e));
    } else {
      audioRef.current.pause();
    }
  };

  return (
    <div className={cx('task-container', className)}>

      {preHeader}

      <div className={cx('task-header', headerClassName)}>
        {shouldRenderTitle ? (
          <h1>
            {title}
            {tooltip}
          </h1>
        ) : tooltip ? (
          <h1 className="task-header-tooltip-only">
            {tooltip}
          </h1>
        ) : null}

        {showSpacer && <div className="flexible-spacer" />}

        {instructions != null && (
          <div
            key={instructionsKey}
            className={cx('instruction-card active-instructions', instructionsClassName)}
          >
            {/* Audio player — only rendered when a src is provided via context */}
            {autoAudioSrc && (
              <div className="audio-instruction-wrapper">
                <button
                  className="audio-toggle-btn"
                  onClick={toggleAudio}
                  aria-label={isPlaying ? 'Pause instructions' : 'Play instructions'}
                >
                  {isPlaying ? '⏸' : '🔊'}
                </button>
                <audio
                  ref={audioRef}
                  src={autoAudioSrc}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={(e) => {
                    console.warn("Audio failed to load:", autoAudioSrc);
                    setIsPlaying(false);
                  }}
                />
              </div>
            )}

            <div className="instruction-text">
              {instructions}
            </div>
          </div>
        )}
      </div>

      <div className={cx('recording-area', mainClassName)}>
        {children}
      </div>

      <div className={cx('bottom-controls', controlsClassName)}>
        {controls}
      </div>

    </div>
  );
}
