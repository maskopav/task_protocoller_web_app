import React, { useState } from "react";
import "./PreTestInstructions.css";

const INSTRUCTIONS = [
  {
    id: "landscape",
    label: "Hold your phone sideways.",
    info: "To enable screen rotation, swipe down from the top of your screen to open the Quick Settings panel and tap the Auto-rotate icon to activate it. If it says 'Portrait' or 'Locked,' tap it until it changes to 'Auto-rotate'."
  },
  {
    id: "brightness",
    label: "Turn brightness to maximum.",
    info: "Turn your screen brightness all the way up in your device settings."
  },
  {
    id: "color_filters",
    label: "Ensure colors look normal.",
    info: "If your screen has a yellow tint, turn off settings like Night Shift, True Tone, or Eye Comfort."
  },
  {
    id: "privacy_screen",
    label: "Ensure your screen is clear.",
    info: "Dark privacy screen covers can distort colors. If you have one attached and cannot remove it, select 'Can't'."
  },
  {
    id: "environment",
    label: "Avoid direct sunlight.",
    info: "Stay indoors in a well-lit room to prevent glare on your screen."
  }
];

export default function PreTestInstructions({ onComplete }) {
  const [answers, setAnswers] = useState({});
  const [expandedInfo, setExpandedInfo] = useState(null);

  const handleSelect = (id, value) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value
    }));
  };

  const toggleInfo = (id) => {
    setExpandedInfo(expandedInfo === id ? null : id);
  };

  const allAnswered = INSTRUCTIONS.every((item) => answers[item.id]);

  const handleStart = () => {
    onComplete(answers);
  };

  return (
    <div className="instructions-container">
      <h2>Pre-Test Checklist</h2>
      <p className="instructions-subtext">
        For accurate results, please adjust your device and environment. 
        Select your status for each item below.
      </p>

      <div className="checklist-wrapper">
        {INSTRUCTIONS.map((item) => (
          <div key={item.id} className="checklist-item">
            <div className="item-header">
              <p className="item-label">
                {item.label}
                <button 
                  className="info-button" 
                  onClick={() => toggleInfo(item.id)}
                  aria-label="More info"
                  title="Click for more info"
                >
                  (?)
                </button>
              </p>
            </div>
            
            {/* NEW CLOSABLE INFO WINDOW */}
            {expandedInfo === item.id && (
              <div className="info-window">
                <p className="item-info-text">{item.info}</p>
                <button 
                  className="close-info-btn" 
                  onClick={() => toggleInfo(item.id)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            )}

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