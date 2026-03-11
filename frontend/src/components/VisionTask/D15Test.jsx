import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./D15Test.css";

const D15_COLORS = [
  "#727a8e", // Reference (Cap 0)
  "#6d8194", "#668995", "#5f9191", "#5b9789", "#5e9c7c",
  "#68a06d", "#77a25e", "#88a252", "#9ba04a", "#ae9c4a",
  "#c09653", "#ce9062", "#d68b75", "#d7898a", "#d18a9f"
];

const TOTAL_SLOTS = D15_COLORS.length; // 16 total slots (including reference)

export default function D15Test({ onNextTask }) {
  const { t } = useTranslation("tasks");
  const [tray, setTray] = useState([D15_COLORS[0]]);
  
  // We keep the shuffled caps in fixed positions permanently
  const [shuffledCaps, setShuffledCaps] = useState([]);

  useEffect(() => {
    // Shuffle the 15 movable caps ONCE on mount
    setShuffledCaps(D15_COLORS.slice(1).sort(() => Math.random() - 0.5));
  }, []);

  const handleSelect = (color) => {
    if (!tray.includes(color)) {
      setTray([...tray, color]);
    }
  };

  const handleUndo = (color, index) => {
    if (index === 0) return; // Cannot undo the reference cap
    setTray(tray.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setTray([D15_COLORS[0]]);
    // Re-shuffle the bottom case
    setShuffledCaps(D15_COLORS.slice(1).sort(() => Math.random() - 0.5));
  };

  const handleDone = () => {
    const resultIndices = tray.map(c => D15_COLORS.indexOf(c));
    onNextTask({ result: resultIndices, timestamp: new Date().toISOString() });
  };

  return (
    <div className="vision-task-container">
      <div className="instructions-header">
        <p>{t("farnsworthD15.instructions")}</p>
      </div>
      
      {/* --- THE TOP PREDEFINED TRAY --- */}
      <div className="d15-tray-section">
        <p className="undo-instructions">{t("farnsworthD15.controls.undo")}</p>
        <div className="d15-tray-container">
          {Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
            const capColor = tray[index]; 
            
            return (
              <div 
                key={index} 
                className={`d15-tray-slot ${index === 0 ? 'reference-slot' : ''}`}
                style={{ zIndex: index }}
                onClick={() => capColor && handleUndo(capColor, index)}
              >
                {capColor && (
                  <div className="d15-cap" style={{ backgroundColor: capColor }}>
                    {index === 0 && <span className="ref-dot"></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- THE UNSORTED CAPS TRAY --- */}
      <div className="d15-options-section">
        <p className="undo-instructions">{t("farnsworthD15.controls.select_next")}</p>
        <div className="d15-tray-container options-tray">
          
          {/* INVISIBLE PLACEHOLDER: Mimics the Reference Cap from the top tray to ensure perfect alignment! */}
          <div className="d15-tray-slot" style={{ visibility: 'hidden', pointerEvents: 'none', zIndex: 0 }}></div>

          {shuffledCaps.map((color, index) => {
            const isPlaced = tray.includes(color);

            return (
              <div 
                key={index} 
                className="d15-tray-slot option-slot"
                style={{ zIndex: index + 1 }} /* +1 because of the placeholder */
              >
                {!isPlaced && (
                  <button 
                    className="d15-cap selectable-cap" 
                    style={{ backgroundColor: color }} 
                    onClick={() => handleSelect(color)}
                    aria-label="Select color"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="vision-controls">
        <button className="btn-secondary" onClick={handleReset}>
          {t("farnsworthD15.controls.reset")}
        </button>
        {/* Only show Submit when all 16 caps are in the tray */}
        {tray.length === TOTAL_SLOTS && (
          <button className="btn-primary" onClick={handleDone}>
            {t("farnsworthD15.controls.submit")}
          </button>
        )}
      </div>
    </div>
  );
}