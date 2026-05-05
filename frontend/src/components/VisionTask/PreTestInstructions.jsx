import React, { useState } from "react";
import InfoToolTip from "../InfoToolTip/InfoToolTip";
import "./PreTestInstructions.css";

// We added 'helpText' to explicitly tell them HOW to do it
const INSTRUCTIONS = [
  {
    id: "landscape",
    label: "Rotate your phone horizontally (Landscape mode).",
    helpText: "Turn your phone sideways so the screen is wider than it is tall. If it doesn't rotate, swipe down from the top of your screen and ensure the 'Portrait Orientation Lock' (padlock icon) is turned off."
  },
  {
    id: "brightness",
    label: "Turn your screen brightness up to 100%.",
    helpText: "Open your phone's Control Center (swipe down from the top right on newer iPhones, or up from the bottom on older phones/Androids) and drag the sun/brightness slider all the way to the maximum."
  },
  {
    id: "color_filters",
    label: "Turn off Night Shift, True Tone, or Eye Comfort Shield.",
    helpText: "Go to your device Settings > Display. Ensure 'True Tone' or 'Night Shift' (Apple) or 'Eye Comfort Shield' / 'Blue Light Filter' (Android) are completely turned off, as these alter colors and will invalidate the test."
  },
  {
    id: "privacy_screen",
    label: "Ensure you do not have a privacy screen protector on.",
    helpText: "Privacy screen protectors block light from certain angles and severely distort brightness and color. If you have a physical privacy film on your screen, click 'Can't / Don't Know'."
  },
  {
    id: "environment",
    label: "Be indoors in a well-lit room, away from direct sunlight.",
    helpText: "Direct sunlight on your screen causes glare that washes out colors. Please take this test inside with standard room lighting turned on."
  }
];

export default function PreTestInstructions({ onComplete }) {
  const [answers, setAnswers] = useState({});

  const handleSelect = (id, value) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value
    }));
  };

  const allAnswered = INSTRUCTIONS.every((item) => answers[item.id]);

  const handleStart = () => {
    onComplete(answers);
  };

  return (
    <div className="instructions-container">
      <h2>Pre-Test Checklist</h2>
      <h3 className="instructions-subtext">
        For accurate results, please adjust your device and environment. 
        Select your status for each item below.
      </h3>

      <div className="checklist-wrapper">
        {INSTRUCTIONS.map((item) => (
          <div key={item.id} className="checklist-item">
            <div className="item-label-container">
              <p className="item-label">{item.label}</p>
              {/* Render the tooltip here! */}
              <InfoToolTip title={item.label} text={item.helpText} />
            </div>
            
            <div className="radio-group">
              <label className={`radio-label ${answers[item.id] === 'done' ? 'selected-done' : ''}`}>
                <input
                  type="radio"
                  name={item.id}
                  value="done"
                  checked={answers[item.id] === "done"}
                  onChange={() => handleSelect(item.id, "done")}
                />
                Done
              </label>
              <label className={`radio-label ${answers[item.id] === 'cannot' ? 'selected-cannot' : ''}`}>
                <input
                  type="radio"
                  name={item.id}
                  value="cannot"
                  checked={answers[item.id] === "cannot"}
                  onChange={() => handleSelect(item.id, "cannot")}
                />
                Can't / Don't Know
              </label>
            </div>
          </div>
        ))}
      </div>

      <button 
        className="btn-primary start-button" 
        disabled={!allAnswered}
        onClick={handleStart}
      >
        Start Test
      </button>
    </div>
  );
}