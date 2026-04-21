import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { swapParticipantProtocolLanguage } from "../../api/participantProtocols";
import "./ParticipantLanguageSelector.css"; 

export default function ParticipantLanguageSelector({ languages, currentAssignedId, token, onConfirm, onSwap, onCancel }) {
  // Extract i18n to can change the global language
  const { t, i18n } = useTranslation(["common"]); 
  const [isSwapping, setIsSwapping] = useState(false);
  
  // Initialize with the currently assigned language
  const initialLang = languages.find(l => l.project_protocol_id === currentAssignedId) || languages[0];
  const [selectedLang, setSelectedLang] = useState(initialLang);

  // Instantly update the app's UI language whenever a new option is clicked
  useEffect(() => {
    if (selectedLang && selectedLang.code) {
      i18n.changeLanguage(selectedLang.code);
    }
  }, [selectedLang, i18n]);

  const handleConfirmClick = async () => {
    if (!selectedLang) return;

    if (selectedLang.project_protocol_id === currentAssignedId) {
      onConfirm();
    } else {
      setIsSwapping(true);
      try {
        await swapParticipantProtocolLanguage(token, selectedLang.project_protocol_id);
        await onSwap(); 
      } catch (err) {
        console.error("Language swap error:", err);
        alert(t("error.generic", "Failed to change language. Please try again."));
        setIsSwapping(false);
      }
    }
  };

  return (
    <div className="language-selector-overlay">
      <div className="language-selector-card">
        
        <h2 className="language-selector-title">
          {/* This title will now instantly translate when a button is clicked! */}
          {t("languageSelector.title", "Please select your language")}
        </h2>
        
        <div className="language-options-list">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelectedLang(lang)}
              disabled={isSwapping}
              className={`language-btn ${selectedLang?.code === lang.code ? 'selected' : ''}`}
            >
              {lang.name}
            </button>
          ))}
        </div>

        <div className="language-buttons-row" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {/* ADD THE CANCEL BUTTON (only shows if onCancel is provided) */}
          {onCancel && (
            <button 
              className="language-cancel-btn"
              onClick={onCancel}
              disabled={isSwapping}
            >
              {t("buttons.cancel", "Cancel")}
            </button>
          )}

            <button 
            className="language-confirm-btn"
            onClick={handleConfirmClick}
            disabled={isSwapping || !selectedLang}
            >
            {/* These will also instantly translate! */}
            {isSwapping ? t("saving", "Saving...") : t("buttons.confirm")}
            </button>
        </div>
      </div>
    </div>
  );
}