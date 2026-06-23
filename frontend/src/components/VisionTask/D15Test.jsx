import React, { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { loadAndComputeD15Colors } from "../../utils/munsellUtils";
import InfoTooltip from "../InfoToolTip/InfoToolTip";
import D15DemoMessage from "./D15DemoMessage";
import { D15MechanicsMessage } from "./D15DemoMessage";
import TaskLayout from "../TaskLayout/TaskLayout";
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

  const version    = task?.params?.version   || "desaturated";
  const randomize  = task?.params?.randomize ?? true;
  const showNumbers = task?.params?.showNumbers || "never";

  // ── Fetch and compute colours on mount ──────────────────────────────
  useEffect(() => {
    async function initColors() {
      let colors;

      if (version === "demo") {
        colors = [
          "#dba68e",
          "#b08775",
          "#84685B",
          "#594942",
          "#2d2a28",
        ];
      } else {
        const targetValue  = version === "saturated" ? 5 : 8;
        const targetChroma = version === "saturated" ? 4 : 2;
        colors = await loadAndComputeD15Colors(
          `${import.meta.env.VITE_APP_BASE_PATH}assets/vision/realColor.dat`,
          targetValue,
          targetChroma,
        );
      }

      setD15Colors(colors);

      const initialTray = Array(colors.length).fill(null);
      initialTray[0] = colors[0];
      setTray(initialTray);

      const remaining = colors.slice(1);
      setShuffledCaps(randomize ? remaining.sort(() => Math.random() - 0.5) : remaining);

      setIsLoading(false);
      setStartTime(Date.now());
    }
    initColors();
  }, [version, randomize]);

  // ── Auto-scroll so the first empty tray slot stays visible ──────────
  useEffect(() => {
    if (!trayRef.current || isLoading) return;

    const firstEmptyIndex = tray.indexOf(null);
    if (firstEmptyIndex === -1) return;

    const container  = trayRef.current;
    const targetSlot = container.children[firstEmptyIndex];
    if (!targetSlot) return;

    const PEEK          = 65;  // px of the first empty slot peeking past the right edge
    const containerRect = container.getBoundingClientRect();
    const slotRect      = targetSlot.getBoundingClientRect();

    // Target: slot's LEFT edge sits PEEK px before the container's right edge
    // → fills the view with placed caps; only a sliver of the next empty slot peeks in
    const delta = slotRect.left - (containerRect.right - PEEK);

    if (Math.abs(delta) > 4) {            // ignore sub-pixel jitter
      container.scrollTo({
        left: Math.max(0, container.scrollLeft + delta),  // clamp: can't scroll before start
        behavior: "smooth",
      });
    }
  }, [tray, isLoading]);

  // ── Interaction handlers ─────────────────────────────────────────────
  const handleSelect = (color) => {
    if (isSubmitted || tray.includes(color)) return;

    const firstEmpty = tray.indexOf(null);
    if (firstEmpty === -1) return;

    setEvents(prev => [...prev, {
      action: "place",
      capIndex: d15Colors.indexOf(color),
      timestampMs: Date.now() - startTime,
    }]);

    const newTray = [...tray];
    newTray[firstEmpty] = color;
    setTray(newTray);
  };

  const handleUndo = (color, index) => {
    if (isSubmitted || index === 0) return;

    setEvents(prev => [...prev, {
      action: "undo",
      capIndex: d15Colors.indexOf(color),
      timestampMs: Date.now() - startTime,
    }]);

    const newTray = [...tray];
    newTray[index] = null;
    setTray(newTray);
  };

  const handleReset = () => {
    setEvents(prev => [...prev, { action: "reset", timestampMs: Date.now() - startTime }]);

    const resetTray = Array(d15Colors.length).fill(null);
    resetTray[0] = d15Colors[0];
    setTray(resetTray);

    const remaining = d15Colors.slice(1);
    setShuffledCaps(randomize ? [...remaining].sort(() => Math.random() - 0.5) : remaining);
  };

  const handleDone = () => {
    if (showNumbers === "after" && !isSubmitted) {
      setIsSubmitted(true);
      return;
    }

    const endTime = Date.now();
    onNextTask({
      result:  tray.map(c => d15Colors.indexOf(c)),
      events,
      metrics: {
        totalDurationMs: endTime - startTime,
        totalMoves:  events.filter(e => e.action === "place").length,
        totalUndos:  events.filter(e => e.action === "undo").length,
        totalResets: events.filter(e => e.action === "reset").length,
      },
      timestamp: new Date(endTime).toISOString(),
    });
  };

  // ── Derived display values ───────────────────────────────────────────
  const isTrayFull     = !tray.includes(null);
  const displayNumbers = showNumbers === "always" || (showNumbers === "after" && isSubmitted);
  const getCapLabel    = (color) => d15Colors.indexOf(color);

  // ── Slot content ─────────────────────────────────────────────────────
  const boardContent = (
    <div className="d15-board">
      <div className="d15-tray-section">
        <div className="d15-tray-container" ref={trayRef}>
          {tray.map((capColor, index) => (
            <div
              key={`tray-slot-${index}`}
              className={`d15-tray-slot ${index === 0 ? "reference-slot" : ""}`}
              onClick={() => capColor && handleUndo(capColor, index)}
            >
              {capColor && (
                <div className="d15-cap" style={{ backgroundColor: capColor }}>
                  {displayNumbers && (
                    <span className="d15-cap-label">{getCapLabel(capColor)}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="d15-options-section">
        <div className="d15-tray-container options-tray">
          {shuffledCaps.map((color, index) => {
            const isPlaced = tray.includes(color);
            return (
              <div key={`option-slot-${index}`} className="d15-tray-slot option-slot">
                {!isPlaced && (
                  <button
                    className="d15-cap selectable-cap"
                    style={{ backgroundColor: color }}
                    onClick={() => handleSelect(color)}
                    aria-label="Select color"
                    disabled={isSubmitted}
                  >
                    {displayNumbers && (
                      <span className="d15-cap-label">{getCapLabel(color)}</span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const controlsContent = (
    <>
      {/* {!isSubmitted && (
        <button className="btn-secondary" onClick={handleReset}>
          {t("d15colour.controls.reset")}
        </button>
      )} */}
      <button
        className="btn-submit"
        onClick={handleDone}
        disabled={!isTrayFull}
      >
        {isSubmitted
          ? t("d15colour.controls.continue", "Continue")
          : t("d15colour.controls.submit")}
      </button>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <TaskLayout
      className="d15-container"
      title={t("d15colour.title")}
      tooltip={
        <InfoTooltip
          title={t("d15colour.demoTitle", "How it works")}
          text={<D15MechanicsMessage />}
        />
      }
      instructions={<Trans t={t} i18nKey="d15colour.goalText" />}
      controls={controlsContent}
    >
      {boardContent}
    </TaskLayout>
  );
}
