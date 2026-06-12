import React from "react";
import { useTranslation, Trans } from "react-i18next";
import "./D15DemoMessage.css";

// DIALOG 1: GOAL
export function D15GoalMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="d15-demo-container">
      <span className="d15-demo-text">
        <Trans t={t} i18nKey="d15colour.goalText"></Trans>
      </span>
      
      <div className="d15-demo-image-wrapper">
        <img src={`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/demo-colours-sequence.png`} alt="D15 demo colours sequence" className="d15-demo-colours-image" />
      </div>

      <span className="d15-demo-text colour-vision-disclaimer">
        <Trans t={t} i18nKey="d15colour.disclaimerText"></Trans>
      </span>
    </div>
  );
}

// DIALOG 2: MECHANICS (INSTRUCTIONS)
export function D15MechanicsMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="d15-demo-container mechanics-layout">
      <div className="mechanics-section">
        <span className="d15-demo-text">
          <Trans t={t} i18nKey="d15colour.addText"></Trans>
        </span>
        <img src={`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/demo-add-colour.gif`} alt="Adding colour demo" className="d15-demo-gif" />
      </div>

      <div className="mechanics-section">
        <span className="d15-demo-text">
          <Trans t={t} i18nKey="d15colour.modifyText"></Trans>
        </span>
        <img src={`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/demo-modify-colour.gif`} alt="Modifying colour demo" className="d15-demo-gif" />
      </div>
    </div>
  );
}

export default function D15DemoMessage() {
  return <D15MechanicsMessage />;
}