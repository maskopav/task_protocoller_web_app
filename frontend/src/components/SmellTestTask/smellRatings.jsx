// src/components/SmellTestTask/smellRatings.jsx
//
// Follow-up ratings asked, in this order, for every picked scent ("No scent"
// skips them). Each one is a step of the rating sheet; `id` is the field it is
// saved under in the answer and its i18n group (tasks:smell.<id>.*). `value` is
// what gets stored — the icon is presentational. Adding a follow-up is one entry.

import React from "react";
import { DEFAULT_EMOJI_SCALE, EmojiFace } from "../../config/emojiRatingScale";

const PLEASANTNESS_KEYS = ["veryUnpleasant", "unpleasant", "neutral", "pleasant", "veryPleasant"];

export const SMELL_RATINGS = [
  {
    id: "intensity",
    // A dot that spreads further inside the circle the stronger the smell
    levels: [
      { value: 1, key: "soft", size: "18%" },
      { value: 2, key: "medium", size: "38%" },
      { value: 3, key: "strong", size: "58%" },
      { value: 4, key: "intense", size: "80%" },
    ],
    renderIcon: (level) => (
      <span className="scent-rating-dot" style={{ "--dot-size": level.size }} aria-hidden="true" />
    ),
  },
  {
    id: "pleasantness",
    // Same faces as the questionnaire emoji scale, so the app reads as one visual language
    levels: DEFAULT_EMOJI_SCALE.map((face, i) => ({ ...face, key: PLEASANTNESS_KEYS[i] })),
    renderIcon: (level) => (
      <span className="scent-rating-face" aria-hidden="true">
        <EmojiFace color={level.color} mouthPath={level.mouthPath} />
      </span>
    ),
  },
];
