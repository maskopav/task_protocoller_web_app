import React, { useState, useEffect, useRef } from "react";  // ← added useRef
import { useTranslation, Trans } from "react-i18next";
import { loadAndComputeD15Colors } from "../../utils/munsellUtils";
import InfoTooltip from "../InfoTooltip/InfoTooltip";
import { D15MechanicsMessage } from "./D15DemoMessage";
import "./D15Test.css";

export default function D15Test({ task, onNextTask }) {
  const { t } = useTranslation("tasks");
  
  const [d15Colors, setD15Colors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isSubmitted, setIsSubmitted] = useState(false);

  const [startTime, setStartTime] = useState(null);
  const [events, setEvents] = useState([]);

  const [tray, setTray] = useState([]);
  const [shuffledCaps, setShuffledCaps] = useState([]);

  const trayRef = useRef(null);

  const version = task?.params?.version || "desaturated";
  const randomize = task?.params?.randomize ?? true;
  const showNumbers = task?.params?.showNumbers || "never";

  // Fetch and compute colors on component mount
  useEffect(() => {
    async function initColors() {
      let colors;

      if (version === "demo") {
        // Simple, easily distinguishable colors for visualization
        colors = [
          "#6f90f5", // Cornflower Blue (Circle 1)
          "#7365e6", // Iris Purple (Circle 2)
          "#c63e7b", // Deep Pink / Raspberry (Circle 3)
          "#e66b2c", // Vibrant Orange (Circle 4)
          "#efb242"  // Warm Yellow / Gold (Circle 5)
        ];
      } else {
        const targetValue = version === "saturated" ? 5 : 8;
        const targetChroma = version === "saturated" ? 4 : 2;

        colors = await loadAndComputeD15Colors(`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/realColor.dat`, targetValue, targetChroma);
      }
      
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
      setStartTime(Date.now());
    }
    
    initColors();
  }, [version, randomize]);

  //  Auto-scroll so the first empty tray slot is always visible
  useEffect(() => {
    if (!trayRef.current || isLoading) return;

    const firstEmptyIndex = tray.indexOf(null);
    if (firstEmptyIndex === -1) return; // Tray full — nothing to reveal

    const container = trayRef.current;
    const targetSlot = container.children[firstEmptyIndex];
    if (!targetSlot) return;

    const BUFFER = 20; // px of breathing room to the right of the empty slot
    const containerRect = container.getBoundingClientRect();
    const slotRect = targetSlot.getBoundingClientRect();

    // Only scroll if the slot is hidden or too close to the right edge
    if (slotRect.right > containerRect.right - BUFFER) {
      container.scrollTo({
        left: container.scrollLeft + (slotRect.right - containerRect.right) + BUFFER,
        behavior: "smooth",
      });
    }
  }, [tray, isLoading]);

  const handleSelect = (color) => {
    if (isSubmitted) return;

    if (!tray.includes(color)) {
      const firstEmptyIndex = tray.indexOf(null);
      if (firstEmptyIndex !== -1) {
        setEvents(prev => [...prev, { 
          action: "place", 
          capIndex: d15Colors.indexOf(color), 
          timestampMs: Date.now() - startTime 
        }]);

        const newTray = [...tray];
        newTray[firstEmptyIndex] = color; 
        setTray(newTray);
      }
    }
  };

  const handleUndo = (color, index) => {
    if (isSubmitted || index === 0) return; 

    setEvents(prev => [...prev, { 
      action: "undo", 
      capIndex: d15Colors.indexOf(color), 
      timestampMs: Date.now() - startTime 
    }]);
    
    const newTray = [...tray];
    newTray[index] = null; 
    setTray(newTray);
  };

  const handleReset = () => {
    setEvents(prev => [...prev, { 
      action: "reset", 
      timestampMs: Date.now() - startTime 
    }]);
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

    const endTime = Date.now();
    const resultIndices = tray.map(c => d15Colors.indexOf(c));
    
    onNextTask({ 
      result: resultIndices, 
      events: events,
      metrics: {
        totalDurationMs: endTime - startTime,
        totalMoves: events.filter(e => e.action === "place").length,
        totalUndos: events.filter(e => e.action === "undo").length,
        totalResets: events.filter(e => e.action === "reset").length,
      },
      timestamp: new Date(endTime).toISOString() 
    });
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
        <h1>{t("d15colour.title")}
          <InfoTooltip 
            title={t("d15colour.demoTitle", "How it works")}
            text={<D15MechanicsMessage />} 
          />
        </h1>
        <p>
          <Trans 
            t={t}
            i18nKey="d15colour.goalText" 
          />
        </p>
      </div>
      
      <div className="d15-board">
        <div className="d15-tray-section">
          <div className="d15-tray-container" ref={trayRef}>
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
