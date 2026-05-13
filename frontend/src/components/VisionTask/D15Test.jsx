import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadAndComputeD15Colors } from "../../utils/munsellUtils";
import "./D15Test.css";

export default function D15Test({ onNextTask }) {
  const { t } = useTranslation("tasks");
  
  const [d15Colors, setD15Colors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [tray, setTray] = useState([]);
  const [shuffledCaps, setShuffledCaps] = useState([]);

  // Fetch and compute colors on component mount
  useEffect(() => {
    async function initColors() {
      // By default, this computes Value 8, Chroma 2 (Lanthony Desaturated)
      // To compute standard D-15, change this to ( "/data/realColor.dat", 5, 4 )
      const colors = await loadAndComputeD15Colors("/data/realColor.dat", 8, 2);
      
      setD15Colors(colors);
      
      // Initialize the tray with the Pilot cap and empty slots
      const initialTray = Array(colors.length).fill(null);
      initialTray[0] = colors[0]; // Pilot cap
      setTray(initialTray);
      
      // Shuffle the remaining caps
      setShuffledCaps(colors.slice(1).sort(() => Math.random() - 0.5));
      setIsLoading(false);
    }
    
    initColors();
  }, []);

  const handleSelect = (color) => {
    // Only proceed if the color isn't already placed
    if (!tray.includes(color)) {
      // Find the first empty slot (left to right)
      const firstEmptyIndex = tray.indexOf(null);
      
      if (firstEmptyIndex !== -1) {
        const newTray = [...tray];
        newTray[firstEmptyIndex] = color; // Fill the specific blank space
        setTray(newTray);
      }
    }
  };

  const handleUndo = (color, index) => {
    if (index === 0) return; // Prevent removing the reference cap
    
    // Replace the removed cap with a null to keep the blank space
    const newTray = [...tray];
    newTray[index] = null; 
    setTray(newTray);
  };

  const handleReset = () => {
    const resetTray = Array(d15Colors.length).fill(null);
    resetTray[0] = d15Colors[0];
    setTray(resetTray);
    
    setShuffledCaps(d15Colors.slice(1).sort(() => Math.random() - 0.5));
  };

  const handleDone = () => {
    const resultIndices = tray.map(c => d15Colors.indexOf(c));
    onNextTask({ result: resultIndices, timestamp: new Date().toISOString() });
  };

  // The tray is full when there are no 'null' values left
  const isTrayFull = !tray.includes(null);

  return (
    <div className="vision-task-container">
      <div className="instructions-header">
        <p>{t("farnsworthD15.instructions")}</p>
      </div>
      
      {/* --- GREY BOARD WRAPPER --- */}
      <div className="d15-board">
        
        {/* --- THE TOP PREDEFINED TRAY --- */}
        <div className="d15-tray-section">
          <div className="d15-tray-container">
            {/* Map directly over our fixed-length tray state array */}
            {tray.map((capColor, index) => {
              return (
                <div 
                  key={`tray-slot-${index}`} 
                  className={`d15-tray-slot ${index === 0 ? 'reference-slot' : ''}`}
                  onClick={() => capColor && handleUndo(capColor, index)}
                >
                  {capColor && (
                    <div className="d15-cap" style={{ backgroundColor: capColor }}></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* --- THE UNSORTED CAPS TRAY --- */}
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
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="vision-controls">
        <button className="btn-secondary" onClick={handleReset}>
          {t("farnsworthD15.controls.reset")}
        </button>
        {isTrayFull && (
          <button className="btn-primary" onClick={handleDone}>
            {t("farnsworthD15.controls.submit")}
          </button>
        )}
      </div>
    </div>
  );
}