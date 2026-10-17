// src/components/SmellTestTask/ScentPicker.jsx
import React from "react";
import { SMELL_IMAGES } from "../../config/smellScents";

// One tappable picture per option. optionImages maps option label → scent key
// (picture from assets/smellIcons/), an image path or an emoji. Exactly 5
// options (4 scents + "No scent") → four circles around a smaller centre one;
// otherwise a plain 2-column grid.
export default function ScentPicker({ question, selected, badge, onPick }) {
  const options = question.options || [];

  return (
    <div
      className={`scent-picker${options.length === 5 ? " is-cross" : ""}`}
      role="radiogroup"
      aria-label={question.text}
    >
      {options.map((opt) => {
        const raw = question.optionImages?.[opt];
        // A bare word is a scent key — no picture if its file is missing
        const img = SMELL_IMAGES[raw] || (/^\w+$/.test(raw ?? "") ? null : raw);
        const isSelected = selected === opt;
        return (
          <button
            type="button"
            key={opt}
            className={`scent-option${isSelected ? " is-selected" : ""}`}
            role="radio"
            aria-checked={isSelected}
            onClick={() => onPick(opt)}
          >
            {img && (/[./]/.test(img)
              ? <img className="scent-option-image" src={img} alt="" />
              : <span className="scent-option-image" aria-hidden="true">{img}</span>)}
            <span className="scent-option-text">{opt}</span>
            {isSelected && badge}
          </button>
        );
      })}
    </div>
  );
}
