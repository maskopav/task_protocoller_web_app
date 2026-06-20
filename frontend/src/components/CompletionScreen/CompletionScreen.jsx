// src/components/CompletionScreen.jsx
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { doneCheckmarkIcon } from "../../assets/successIcons/successAssets";
import "./CompletionScreen.css"; 

export default function CompletionScreen({ testingMode, onBack, pendingUploadCount, networkStatus }) {
  const isOffline   = networkStatus === 'offline';
  const hasPending  = pendingUploadCount > 0;

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
        
        <h1>{t("completion.thankYouTitle")}</h1>
        
        {/* Safety instructions */}
        <div className="instruction-box">
          {pendingUploadCount === null ? null /* first-render check in progress */ : (
            <div className={`upload-status-banner upload-status-banner--${hasPending ? "pending" : "done"}`}>
              {hasPending && isOffline ? (
                <>
                  <p><strong>{t("completion.offlineNoConnection")}</strong></p>
                  <p>{t("completion.offlineDataSafe")}</p>
                  <p>{t("completion.offlineReturnHint")}</p>
                </>
              ) : hasPending ? (
                <p>{t("completion.uploading")}</p>
              ) : (
                <p>{t("completion.safeToClose")}</p>
              )}
            </div>
          )}
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