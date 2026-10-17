// src/components/SmellTestTask/RatingSheet.jsx
import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

// Bottom sheet asking one rating (see smellRatings.jsx) about the scent just
// picked. Portalled so no transformed ancestor can trap the fixed overlay.
export default function RatingSheet({ scentLabel, rating, step, stepCount, value, onPick, onBack, onClose }) {
  const { t } = useTranslation("tasks");

  return createPortal(
    <div className="scent-sheet-backdrop" onClick={onClose}>
      <div
        className="scent-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scent-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        {onBack && (
          <button type="button" className="scent-sheet-icon-btn is-back" aria-label={t("smell.back")} onClick={onBack}>
            ←
          </button>
        )}
        <button type="button" className="scent-sheet-icon-btn is-close" aria-label={t("smell.close")} onClick={onClose}>
          ×
        </button>

        <p className="scent-sheet-scent">{scentLabel}</p>
        <h4 id="scent-sheet-title" className="scent-sheet-title">{t(`smell.${rating.id}.title`)}</h4>

        <div
          className="scent-rating-options"
          role="radiogroup"
          aria-labelledby="scent-sheet-title"
          style={{ "--count": rating.levels.length }}
        >
          {rating.levels.map((level) => (
            <button
              type="button"
              key={level.value}
              className={`scent-rating-option${value === level.value ? " is-selected" : ""}`}
              role="radio"
              aria-checked={value === level.value}
              onClick={() => onPick(level.value)}
            >
              {rating.renderIcon(level)}
              <span className="scent-rating-label">{t(`smell.${rating.id}.${level.key}`)}</span>
            </button>
          ))}
        </div>

        {stepCount > 1 && (
          <div className="scent-sheet-steps" aria-hidden="true">
            {Array.from({ length: stepCount }, (_, i) => (
              <span key={i} className={i === step ? "is-active" : ""} />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
