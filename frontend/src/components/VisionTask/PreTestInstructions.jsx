import React, { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import InfoToolTip from "../InfoToolTip/InfoToolTip";
import TaskLayout from "../TaskLayout/TaskLayout";
import "./PreTestInstructions.css";
import { 
  brightnessIcon, 
  brightnessSlider, 
  settingsIcon 
} from "../../assets/visionIcons/visionAssets";

export default function PreTestInstructions({ onComplete, audioPlayer }) {
  const { t } = useTranslation(["tasks"]); 
  const [answers, setAnswers] = useState({});

  const INSTRUCTIONS = [
    {
      id: "brightness",
      type: "action",
      label: t("preTestChecklist.items.brightness.label"),
      helpText: (
        <Trans 
          t={t}
          i18nKey="preTestChecklist.items.brightness.helpText"
          components={{
            br: <br />,
            strong: <strong />,
            em: <em />,
            imgA: <img src={brightnessIcon} alt="brightness" className="inline-help-icon" />,
            imgB: <img src={settingsIcon} alt="settings" className="inline-help-icon" />,
            imgSlider: <img src={brightnessSlider} alt="slider" style={{ width: "96%", maxWidth: "400px", borderRadius: "8px", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }} />
          }}
        />
      )
    },
    {
      id: "color_filters",
      type: "action",
      label: t("preTestChecklist.items.colourFilters.label"),
      helpText: (
        <Trans 
          t={t}
          i18nKey="preTestChecklist.items.colourFilters.helpText"
          components={{ 
            br: <br />, strong: <strong />, em: <em />,
            imgA: <img src={settingsIcon} alt="settings" className="inline-help-icon" />
          }}
        />
      )
    }
  ];

  const handleSelect = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const allAnswered = INSTRUCTIONS.every((item) => answers[item.id]);

  const handleStart = () => {
    onComplete(answers);
  };

  // Extract the Start button to pass into the TaskLayout 'controls' prop
  const controlsContent = (
    <button 
      className="btn-primary start-button" 
      disabled={!allAnswered}
      onClick={handleStart}
    >
      {t("preTestChecklist.buttons.start")}
    </button>
  );

  return (
    <TaskLayout
      className="pretest-container"
      title={t("preTestChecklist.title")}
      renderTitle={true}
      tooltip={
        audioPlayer ? (
          <div className="pretest-header-tools">
            {audioPlayer}
          </div>
        ) : null
      }
      instructions={t("preTestChecklist.subtitle")}
      controls={controlsContent}
    >
      <div className="checklist-wrapper">
        {INSTRUCTIONS.map((item) => (
          <div key={item.id} className="checklist-item">
            <div className="item-label-container">
              <p className="item-label">{item.label}</p>
              <InfoToolTip title={item.label} text={item.helpText} />
            </div>
            
            {item.type === "question" ? (
              <div className="radio-group">
                <label className={`radio-label ${answers[item.id] === 'yes' ? 'selected-cannot' : ''}`}>
                  <input type="radio" name={item.id} value="yes" checked={answers[item.id] === "yes"} onChange={() => handleSelect(item.id, "yes")} />
                  {t("preTestChecklist.buttons.yes")}
                </label>
                <label className={`radio-label ${answers[item.id] === 'no' ? 'selected-done' : ''}`}>
                  <input type="radio" name={item.id} value="no" checked={answers[item.id] === "no"} onChange={() => handleSelect(item.id, "no")} />
                  {t("preTestChecklist.buttons.no")}
                </label>
                <label className={`radio-label ${answers[item.id] === 'dontKnow' ? 'selected-cannot' : ''}`}>
                  <input type="radio" name={item.id} value="dontKnow" checked={answers[item.id] === "dontKnow"} onChange={() => handleSelect(item.id, "dontKnow")} />
                  {t("preTestChecklist.buttons.dontKnow")}
                </label>
              </div>
            ) : (
              <div className="radio-group">
                <label className={`radio-label ${answers[item.id] === 'done' ? 'selected' : ''}`}>
                  <input type="radio" name={item.id} value="done" checked={answers[item.id] === "done"} onChange={() => handleSelect(item.id, "done")} />
                  {t("preTestChecklist.buttons.done")}
                </label>
                <label className={`radio-label ${answers[item.id] === 'cannot' ? 'selected' : ''}`}>
                  <input type="radio" name={item.id} value="cannot" checked={answers[item.id] === "cannot"} onChange={() => handleSelect(item.id, "cannot")} />
                  {t("preTestChecklist.buttons.cannot")}
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </TaskLayout>
  );
}