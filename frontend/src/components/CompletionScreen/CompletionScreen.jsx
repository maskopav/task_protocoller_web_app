// src/components/CompletionScreen.jsx
import React, { useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  doneCheckmarkIcon,
  noInternetIcon,
  uploadingIcon,
} from "../../assets/successIcons/successAssets";
import helpIcon from "../../assets/generalIcons/help-icon.svg";
import InfoTooltip from "../InfoTooltip/InfoTooltip";
import AudioGuidePlayer from "../AudioGuidePlayer/AudioGuidePlayer";
import { getCompletionAudioPath } from "../../utils/getAudioGuidePath";
import "./CompletionScreen.css";

// Single source of truth for "what state is the completion screen in".
// Everything else (icon, screen color, message) just reads off this,
// so they can never drift out of sync with each other.
function getCompletionStatus(pendingUploadCount, networkStatus, testingMode) {
  // Testing mode never performs a real save, so there's nothing to "check" or
  // wait on. Without this, pendingUploadCount stays null forever in the
  // editor preview and the screen gets stuck spinning indefinitely.
  if (testingMode && pendingUploadCount == null) return "done";
  if (pendingUploadCount === null) return "checking"; // first-render check in progress
  if (pendingUploadCount === 0) return "done";
  return networkStatus === "offline" ? "offline" : "uploading";
}

const STATUS = {
  checking: {
    icon: uploadingIcon,
    spin: true,
    screenClass: "completion-screen--uploading",
    titleKey: "completion.uploadingTitle",
    titleClass: "completion-title--uploading",
    messageKey: null, // No message rendered for checking status
  },
  uploading: {
    icon: uploadingIcon,
    spin: true,
    screenClass: "completion-screen--uploading",
    titleKey: "completion.uploadingTitle",
    titleClass: "completion-title--uploading",
    messageKey: "completion.uploading",
  },
  done: {
    icon: doneCheckmarkIcon,
    spin: false,
    screenClass: "",
    titleKey: "completion.doneTitle",
    titleClass: "completion-title--done",
    messageKey: "completion.safeToClose", 
  },
  offline: {
    icon: noInternetIcon,
    spin: false,
    screenClass: "completion-screen--offline",
    titleKey: "completion.noInternetTitle",
    titleClass: "completion-title--offline",
    messageKey: "completion.offlineBrief", 
  },
};

export default function CompletionScreen({ testingMode, onBack, pendingUploadCount, networkStatus, audioGuideEnabled }) {
  const { t, i18n } = useTranslation(["common", "admin"]);
  const status = getCompletionStatus(pendingUploadCount, networkStatus, testingMode);

  // Destructure the new messageKey from STATUS
  const { icon, spin, screenClass, titleKey, titleClass, messageKey } = STATUS[status];

  useEffect(() => {
    // When the audio guide is on, the spoken guide clip (below) plays instead.
    if (audioGuideEnabled) return;
    // Otherwise fall back to the same success sound as in ModuleCompletionOverlay.
    const audio = new Audio(`${import.meta.env.VITE_APP_BASE_PATH}audio/sounds/success_sound.m4a`);
    audio.play().catch(e => console.log("Audio play blocked", e));
  }, [audioGuideEnabled]);

  const iconAlt = status === "offline" ? "No internet connection" : status === "done" ? "Completion checkmark" : "Uploading";
  const iconEl = (
    <img
      src={icon}
      alt={iconAlt}
      className={`completion-icon ${spin ? "completion-icon--spinning" : ""}`}
    />
  );

  return (
    <div className={`completion-screen ${screenClass}`}>
      <div className="completion-card">
        {audioGuideEnabled && (
          <div className="completion-audio-guide">
            <AudioGuidePlayer
              src={getCompletionAudioPath(i18n.language)}
              playTrigger={1}
              isRecordingActive={false}
            />
          </div>
        )}
        {iconEl}
        <h1 className={titleClass}>
          <Trans t={t} i18nKey={titleKey} />
        </h1>

        {/* Safety instructions */}
        <div className="instruction-box">
          {messageKey && (
            <div className={`upload-status-banner--${status}`}>
              <p>
                <Trans t={t} i18nKey={messageKey} />
              </p>
              {status === "offline" && (
                  <InfoTooltip 
                    title={t("completion.offlineModalInfo")} 
                    icon={helpIcon}
                  />
                )}
            </div>
          )}
        </div>

        {/* For Admin Testing Mode */}
        {testingMode && (
          <div className="admin-actions">
            <button className="btn-primary-back" onClick={onBack}>
              {t("protocolEditor.buttons.backToEditor", { ns: "admin"})}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}