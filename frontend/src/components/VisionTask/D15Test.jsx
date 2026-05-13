import React, { useState, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import { loadAndComputeD15Colors } from "../../utils/munsellUtils";
import "./D15Test.css";

export default function D15Test({ task, onNextTask }) {
  const { t } = useTranslation("tasks");
  
  const [d15Colors, setD15Colors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- NEW: Add a state to track if the user has clicked submit ---
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [tray, setTray] = useState([]);
  const [shuffledCaps, setShuffledCaps] = useState([]);

  const version = task?.params?.version || "desaturated";
  const randomize = task?.params?.randomize ?? true;
  const showNumbers = task?.params?.showNumbers || "never";

  // Fetch and compute colors on component mount
  useEffect(() => {
    async function initColors() {
      const targetValue = version === "saturated" ? 5 : 8;
      const targetChroma = version === "saturated" ? 4 : 2;

      const colors = await loadAndComputeD15Colors("/data/realColor.dat", targetValue, targetChroma);
      
      setD15Colors(colors);
      
      const initialTray = Array(colors.length).fill(null);
      initialTray[0] = colors[0]; // Pilot cap
      setTray(initialTray);
      
      const remainingCaps = colors.slice(1);
      if (randomize) {
        setShuffledCaps(remainingCaps.sort(() => Math.random() - 0.5));
      } else {
        setShuffledCaps(remainingCaps);
      }

      setIsLoading(false);
    }
    
    initColors();
  }, [version, randomize]);

  const handleSelect = (color) => {
    if (isSubmitted) return;

    if (!tray.includes(color)) {
      const firstEmptyIndex = tray.indexOf(null);
      if (firstEmptyIndex !== -1) {
        const newTray = [...tray];
        newTray[firstEmptyIndex] = color; 
        setTray(newTray);
      }
    }
  };

  const handleUndo = (color, index) => {
    if (isSubmitted || index === 0) return; 
    
    const newTray = [...tray];
    newTray[index] = null; 
    setTray(newTray);
  };

  const handleReset = () => {
    const resetTray = Array(d15Colors.length).fill(null);
    resetTray[0] = d15Colors[0];
    setTray(resetTray);
    
    const remainingCaps = d15Colors.slice(1);
    if (randomize) {
      setShuffledCaps([...remainingCaps].sort(() => Math.random() - 0.5));
    } else {
      setShuffledCaps(remainingCaps);
    }
  };

  const handleDone = () => {
    if (showNumbers === "after" && !isSubmitted) {
      setIsSubmitted(true);
      return; 
    }

    // Proceed to next task
    const resultIndices = tray.map(c => d15Colors.indexOf(c));
    onNextTask({ result: resultIndices, timestamp: new Date().toISOString() });
  };

  const isTrayFull = !tray.includes(null);

  // Show numbers logic
  const displayNumbers = showNumbers === "always" || (showNumbers === "after" && isSubmitted);

  const getCapLabel = (color) => {
    const index = d15Colors.indexOf(color);
    return index; 
  };

  return (
    <div className="vision-task-container">
      <div className="instructions-header">
        <h1>{t("d15colour.title")}</h1>
        <p>
          <Trans 
            t={t}
            i18nKey="d15colour.instructions" 
            components={{ strong: <strong />, br: <br /> }} 
          />
        </p>
      </div>
      
      <div className="d15-board">
        <div className="d15-tray-section">
          <div className="d15-tray-container">
            {tray.map((capColor, index) => {
              return (
                <div 
                  key={`tray-slot-${index}`} 
                  className={`d15-tray-slot ${index === 0 ? 'reference-slot' : ''}`}
                  onClick={() => capColor && handleUndo(capColor, index)}
                >
                  {capColor && (
                    <div className="d15-cap" style={{ backgroundColor: capColor }}>
                      {displayNumbers && (
                        <span className="d15-cap-label">
                          {getCapLabel(capColor)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="d15-options-section">
          <div className="d15-tray-container options-tray">
            {shuffledCaps.map((color, index) => {
              const isPlaced = tray.includes(color);

              return (
                <div 
                  key={`option-slot-${index}`} 
                  className="d15-tray-slot option-slot"
                >
                  {!isPlaced && (
                    <button 
                      className="d15-cap selectable-cap" 
                      style={{ backgroundColor: color }} 
                      onClick={() => handleSelect(color)}
                      aria-label="Select color"
                      disabled={isSubmitted} // Prevent tabbing/clicking if submitted
                    >
                      {displayNumbers && (
                        <span className="d15-cap-label">
                          {getCapLabel(color)}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="vision-controls">
        {!isSubmitted && (
          <button className="btn-secondary" onClick={handleReset}>
            {t("d15colour.controls.reset")}
          </button>
        )}
        
        <button 
          className="btn-submit" 
          onClick={handleDone}
          disabled={!isTrayFull}
        >
          {isSubmitted ? t("d15colour.controls.continue", "Continue") : t("d15colour.controls.submit")}
        </button>
      </div>
    </div>
  );
}