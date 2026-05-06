import React, { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import InfoToolTip from "../InfoToolTip/InfoToolTip";
import "./PreTestInstructions.css";

// IMPORT YOUR ICONS HERE
import rotateIconA from "../../assets/mobile-rotate-icon.svg"; 
import rotateIconB from "../../assets/lock-reset-icon.svg"; 
import rotateIconC from "../../assets/screen-rotation-icon.svg"; 
import brightnessIcon from "../../assets/brightness-icon.svg"; 
import brightnessSlider from "../../assets/brightness-slider.png";

export default function PreTestInstructions({ onComplete }) {
  // Load the translation hook for the "tasks" namespace
  const { t } = useTranslation(["tasks"]); 
  const [answers, setAnswers] = useState({});

  // Dynamic Instructions Array using <Trans> for embedded formatting and images
  const INSTRUCTIONS = [
    {
      id: "landscape",
      label: t("preTestChecklist.items.landscape.label"),
      helpText: (
        <Trans 
          t={t} /* <--- THIS FIXES THE RENDER ISSUE */
          i18nKey="preTestChecklist.items.landscape.helpText"
          components={{
            br: <br />,
            strong: <strong />,
            imgA: <img src={rotateIconA} alt="rotate" className="inline-help-icon" />,
            imgB: <img src={rotateIconB} alt="rotate" className="inline-help-icon" />,
            imgC: <img src={rotateIconC} alt="rotate" className="inline-help-icon" />
          }}
        />
      )
    },
    {
      id: "brightness",
      label: t("preTestChecklist.items.brightness.label"),
      helpText: (
        <Trans 
          t={t}
          i18nKey="preTestChecklist.items.brightness.helpText"
          components={{
            br: <br />,
            strong: <strong />,
            imgA: <img src={brightnessIcon} alt="brightness" className="inline-help-icon" />,
            imgSlider: <img src={brightnessSlider} alt="slider" style={{ width: "96%", maxWidth: "400px", borderRadius: "8px", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }} />
          }}
        />
      )
    },
    {
      id: "color_filters",
      label: t("preTestChecklist.items.colorFilters.label"),
      helpText: (
        <Trans 
          t={t}
          i18nKey="preTestChecklist.items.colorFilters.helpText"
          components={{ br: <br />, strong: <strong />, em: <em /> }}
        />
      )
    },
    {
      id: "privacy_screen",
      label: t("preTestChecklist.items.privacyScreen.label"),
      helpText: (
        <Trans 
          t={t}
          i18nKey="preTestChecklist.items.privacyScreen.helpText"
          components={{ br: <br />, strong: <strong /> }}
        />
      )
    },
    {
      id: "environment",
      label: t("preTestChecklist.items.environment.label"),
      helpText: t("preTestChecklist.items.environment.helpText") // Standard text, no <Trans> needed
    }
  ];

  const handleSelect = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const allAnswered = INSTRUCTIONS.every((item) => answers[item.id]);

  const handleStart = () => {
    onComplete(answers);
  };

  return (
    <div className="instructions-container">
      <h2>{t("preTestChecklist.title")}</h2>
      <h3 className="instructions-subtext">
        {t("preTestChecklist.subtitle")}
      </h3>

      <div className="checklist-wrapper">
        {INSTRUCTIONS.map((item) => (
          <div key={item.id} className="checklist-item">
            <div className="item-label-container">
              <p className="item-label">{item.label}</p>
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
                {t("preTestChecklist.buttons.done")}
              </label>
              <label className={`radio-label ${answers[item.id] === 'cannot' ? 'selected-cannot' : ''}`}>
                <input
                  type="radio"
                  name={item.id}
                  value="cannot"
                  checked={answers[item.id] === "cannot"}
                  onChange={() => handleSelect(item.id, "cannot")}
                />
                {t("preTestChecklist.buttons.cannot")}
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
        {t("preTestChecklist.buttons.start")}
      </button>
    </div>
  );
}
