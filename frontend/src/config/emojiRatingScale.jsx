// src/config/emojiRatingScale.jsx
//
// Single source of truth for the emoji rating scale used by:
//   - Questionnaire.jsx        (renders the tappable faces to the patient)
//   - QuestionnaireModal.jsx   (shows a read-only preview to whoever builds the questionnaire)

import React from "react";

const FACE_FEATURE_COLOR = "#22314f";

/**
 * A single circular emoji face. `color` fills the circle, `mouthPath` draws
 * the expression. Sized entirely by its container (width/height: 100%).
 */
export function EmojiFace({ color, mouthPath, className }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="48" fill={color} />
      <circle cx="34" cy="42" r="6" fill={FACE_FEATURE_COLOR} />
      <circle cx="66" cy="42" r="6" fill={FACE_FEATURE_COLOR} />
      <path
        d={mouthPath}
        fill="none"
        stroke={FACE_FEATURE_COLOR}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The scale itself. `value` is what actually gets stored/submitted as the
// answer — everything else here is presentational.
export const DEFAULT_EMOJI_SCALE = [
  {
    value: 1,
    labelKey: "common:questionnaire.rating.veryBad",
    label: "Very bad",
    color: "#e74c3c",
    bg: "#fdecea",
    mouthPath: "M 30 68 Q 50 50 70 68",
  },
  {
    value: 2,
    labelKey: "common:questionnaire.rating.bad",
    label: "Bad",
    color: "#e67e22",
    bg: "#fdf1e6",
    mouthPath: "M 32 66 Q 50 55 68 66",
  },
  {
    value: 3,
    labelKey: "common:questionnaire.rating.okay",
    label: "Okay",
    color: "#f1c40f",
    bg: "#fdf8e3",
    mouthPath: "M 32 64 L 68 64",
  },
  {
    value: 4,
    labelKey: "common:questionnaire.rating.good",
    label: "Good",
    color: "#8bc34a",
    bg: "#f1f8e9",
    mouthPath: "M 30 58 Q 50 74 70 58",
  },
  {
    value: 5,
    labelKey: "common:questionnaire.rating.veryGood",
    label: "Very good",
    color: "#27ae60",
    bg: "#eafaf1",
    mouthPath: "M 26 54 Q 50 84 74 54",
  },
];
