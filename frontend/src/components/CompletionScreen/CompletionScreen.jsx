// src/components/CompletionScreen.jsx
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import doneCheckmarkIcon from "../../assets/done-checkmark-icon.svg";
import "./CompletionScreen.css"; 

export default function CompletionScreen({ testingMode, onBack }) {
  const { t } = useTranslation(["common", "admin"]);

  useEffect(() => {
    // Play the same success sound as in ModuleCompletionOverlay
    const audio = new Audio(`${import.meta.env.VITE_APP_BASE_PATH}audio/sounds/success_fanfare.mp3`);
    audio.play().catch(e => console.log("Audio play blocked", e));
  }, []);

  return (
    <div className="completion-screen">
      <div className="completion-card">
        <img
          src={doneCheckmarkIcon}
          alt="Completion checkmark"
          className="completion-icon"
        />
        
        {/* Main thank you message */}
        <h1>{t("completion.thankYouTitle")}</h1>
        <p className="completion-message">{t("completion.thankYouMessage")}</p>
        
        {/* Safety instructions */}
        <div className="instruction-box">
          <p>{t("completion.safeToClose")}</p>
        </div>

        {/* For Admin Testing Mode */}
        {testingMode && (
          <div className="admin-actions">
            <button className="btn-primary-back" onClick={onBack}>
              {t("buttons.backToEditor", { ns: "admin", defaultValue: "← Back to Editor" })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}