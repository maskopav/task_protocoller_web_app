import React, { useState, useEffect } from "react";
import "./D15Test.css";

// Standard D-15 Colors (Approximate Hex codes)
const D15_COLORS = [
  "#727a8e", // Reference (Cap 0)
  "#6d8194", "#668995", "#5f9191", "#5b9789", "#5e9c7c",
  "#68a06d", "#77a25e", "#88a252", "#9ba04a", "#ae9c4a",
  "#c09653", "#ce9062", "#d68b75", "#d7898a", "#d18a9f"
];

export default function D15Test({ onNextTask }) {
  const [tray, setTray] = useState([D15_COLORS[0]]); // Starts with reference cap
  const [options, setOptions] = useState([]);

  useEffect(() => {
    // Shuffle caps 1-15
    const caps = D15_COLORS.slice(1).sort(() => Math.random() - 0.5);
    setOptions(caps);
  }, []);

  const handleSelect = (color, index) => {
    setTray([...tray, color]);
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setTray([D15_COLORS[0]]);
    setOptions(D15_COLORS.slice(1).sort(() => Math.random() - 0.5));
  };

  const handleDone = () => {
    // Return the sequence of color indices for scoring
    const resultIndices = tray.map(c => D15_COLORS.indexOf(c));
    onNextTask({ result: resultIndices, timestamp: new Date().toISOString() });
  };

  return (
    <div className="vision-task-container">
      <h3>Arrange the colors in sequence</h3>
      
      <div className="tray-area">
        <p>Your Sequence:</p>
        <div className="caps-grid">
          {tray.map((color, i) => (
            <div key={i} className="cap" style={{ backgroundColor: color }}>
              {i === 0 && <span className="ref-label">Start</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="options-area">
        <p>Tap to pick the next closest color:</p>
        <div className="caps-grid selectable">
          {options.map((color, i) => (
            <div 
              key={i} 
              className="cap" 
              style={{ backgroundColor: color }} 
              onClick={() => handleSelect(color, i)}
            />
          ))}
        </div>
      </div>

      <div className="vision-controls">
        <button className="btn-secondary" onClick={handleReset}>Reset</button>
        {options.length === 0 && (
          <button className="btn-primary" onClick={handleDone}>Submit Result</button>
        )}
      </div>
    </div>
  );
}