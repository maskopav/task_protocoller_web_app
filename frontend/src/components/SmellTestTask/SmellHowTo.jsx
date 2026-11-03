// src/components/SmellTestTask/SmellHowTo.jsx
import React, { useEffect, useRef, useState } from "react";
import FormattedText from "../FormattedText/FormattedText";

// Silent demo clip: rub a box, smell it, tap the answer. Shared by all languages.
// (A compressed copy of cichovy-test-cisty.mp4.) Bump ?v= whenever the file is
// replaced, so browsers do not keep playing a cached older cut.
const HOWTO_VIDEO = `${import.meta.env.BASE_URL}assets/smell/smell-howto.mp4?v=2`;

// When each step starts in the clip, in seconds: one per entry in
// tasks:smell.howToSteps (the last one is "repeat for every circle").
// Re-measure if the clip is re-cut.
const HOWTO_STEP_STARTS = [0, 4.54, 9.28, 19.16];

// Slower than recorded and with a pause before each replay, so there is time
// to read the caption and follow the hand (older participants especially).
// Captions follow the clip's own time, so they stay in step at any speed.
const HOWTO_PLAYBACK_RATE = 0.8;
const HOWTO_REPLAY_PAUSE_MS = 3000;

const stepAt = (time) => HOWTO_STEP_STARTS.filter((start) => time >= start).length - 1;

// The replaying clip with one step below it at a time, following the video.
// Steps carry no numbers, which could be
// mistaken for the numbered circles on the card. Tapping a progress bar jumps
// the clip to that step. Without the clip (missing file, no network) all steps
// are listed at once instead.
export default function SmellHowTo({ steps }) {
  const videoRef = useRef(null);
  const [step, setStep] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const replayTimer = useRef(null);
  useEffect(() => () => clearTimeout(replayTimer.current), []);

  if (videoFailed) {
    return (
      <ul className="smell-howto-steps">
        {steps.map((text, i) => <li key={i}><FormattedText text={text} /></li>)}
      </ul>
    );
  }

  // jsdom has no play(); a browser may refuse it (e.g. data saver) — the
  // participant can still read the caption and move on
  const play = () => videoRef.current?.play?.()?.catch(() => {});

  // Holds the last frame (the next scent opening) and the repeat step,
  // then starts over
  const replayAfterPause = () => {
    replayTimer.current = setTimeout(() => {
      videoRef.current.currentTime = 0;
      play();
    }, HOWTO_REPLAY_PAUSE_MS);
  };

  const jumpTo = (i) => {
    clearTimeout(replayTimer.current);
    videoRef.current.currentTime = HOWTO_STEP_STARTS[i];
    setStep(i);
    play();
  };

  return (
    <>
      <video
        ref={videoRef}
        className="smell-howto-video"
        src={HOWTO_VIDEO}
        autoPlay muted playsInline
        onLoadedMetadata={(e) => { e.currentTarget.playbackRate = HOWTO_PLAYBACK_RATE; }}
        onEnded={replayAfterPause}
        // Clamped, so a translation with fewer steps never blanks the caption
        onTimeUpdate={(e) => setStep(Math.min(stepAt(e.currentTarget.currentTime), steps.length - 1))}
        onError={() => setVideoFailed(true)}
      />
      <div className="smell-howto-caption">
        <div className="smell-howto-progress">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`smell-howto-bar${i <= step ? " is-reached" : ""}`}
              aria-label={String(i + 1)}
              aria-current={i === step ? "step" : undefined}
              onClick={() => jumpTo(i)}
            />
          ))}
        </div>
        {/* All steps share one grid cell, so the caption keeps the height of
            the longest and the video does not jump when the text changes */}
        <div className="smell-howto-stack">
          {steps.map((text, i) => (
            <div
              key={i}
              className={`smell-howto-step${i === step ? " is-active" : ""}`}
              aria-hidden={i !== step}
            >
              <FormattedText text={text} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
