import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./D15Test.css";

const D15_COLORS = [
  "#727a8e", // Reference (Cap 0)
  "#6d8194", "#668995", "#5f9191", "#5b9789", "#5e9c7c",
  "#68a06d", "#77a25e", "#88a252", "#9ba04a", "#ae9c4a",
  "#c09653", "#ce9062", "#d68b75", "#d7898a", "#d18a9f"
];

export default function D15Test({ onNextTask }) {
  const { t } = useTranslation("tasks");
  const [tray, setTray] = useState([D15_COLORS[0]]);
  const [options, setOptions] = useState([]);

  useEffect(() => {
    const caps = D15_COLORS.slice(1).sort(() => Math.random() - 0.5);
    setOptions(caps);
  }, []);

  const handleSelect = (color, index) => {
    setTray([...tray, color]);
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleUndo = (color, index) => {
    if (index === 0) return; // Cannot undo the reference cap
    setTray(tray.filter((_, i) => i !== index));
    setOptions([...options, color]);
  };

  const handleReset = () => {
    setTray([D15_COLORS[0]]);
    setOptions(D15_COLORS.slice(1).sort(() => Math.random() - 0.5));
  };

  const handleDone = () => {
    const resultIndices = tray.map(c => D15_COLORS.indexOf(c));
    onNextTask({ result: resultIndices, timestamp: new Date().toISOString() });
  };

  return (
    <div className="vision-task-container d15-vertical-layout">
      <div className="instructions-header">
        <p>{t("farnsworthD15.instructions")}</p>
      </div>
      
      {/* Target Area: Shows only the most recently placed cap for comparison */}
      <div className="active-comparison-zone">
      <div className="tray-area">
        <p className="undo-instructions">{t("farnsworthD15.controls.undo")}</p>
        <div className="tray-row-container">
          {tray.map((color, i) => (
            <div 
              key={i} 
              className="cap disc" 
              style={{ 
                backgroundColor: color,
                zIndex: i // Ensures later caps overlap previous ones
              }}
              onClick={() => handleUndo(color, i)}
            >
              {i === 0 && <span className="ref-label">S</span>}
            </div>
          ))}
        </div>
      </div>
        <small className="undo-hint">{t("farnsworthD15.controls.undo")}</small>
      </div>

      <div className="options-area">
        <div className="caps-grid selectable">
          {options.map((color, i) => (
            <button 
              key={i} 
              className="cap disc selectable-button" 
              style={{ backgroundColor: color }} 
              onClick={() => handleSelect(color, i)}
              aria-label="Select color"
            />
          ))}
        </div>
      </div>

      <div className="vision-controls">
        <button className="btn-secondary" onClick={handleReset}>
          {t("farnsworthD15.controls.reset")}
        </button>
        {options.length === 0 && (
          <button className="btn-primary" onClick={handleDone}>
            {t("farnsworthD15.controls.submit")}
          </button>
        )}
      </div>
    </div>
  );
}