import React from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../i18n";
import "./ProtocolLanguageSelector.css"; 

export default function ProtocolLanguageSelector({ value, onChange, disabled, editingMode }) {
  const { t } = useTranslation(["admin"]);

  // Normalize the value to always be an array for easier handling
  const selectedLangs = Array.isArray(value) ? value : (value ? [value] : ["en"]);

  const toggleLanguage = (code) => {
    if (disabled) return;
    if (selectedLangs.includes(code)) {
      // Prevent unchecking the very last language
      if (selectedLangs.length === 1) return;
      onChange(selectedLangs.filter((c) => c !== code));
    } else {
      onChange([...selectedLangs, code]);
    }
  };

  // --- EDITING MODE: Show Read-Only Badge & Add Variant Option ---
  if (editingMode) {
    const currentLangObj = LANGUAGES.find(l => l.code === (selectedLangs[0] || "en"));
    
    // Find any additional languages the admin clicked to add during this edit session
    const newlyAddedLangs = selectedLangs.slice(1); 

    return (
      <div className="protocol-field">
        <label className="protocol-label">
          {t("protocolEditor.currentlyEditingLang")}
        </label>
        <div className="protocol-lang-badge">
          {currentLangObj?.label || selectedLangs[0]}
        </div>

        {/* Add Missing Language Variants*/}
        <div className="protocol-lang-add-section">
          <label className="protocol-lang-add-label">
            ➕ {t("protocolEditor.addNewVariant", "Add New Language Variant")}
          </label>
          <div className="protocol-lang-pill-container">
            {LANGUAGES.map((lang) => {
              if (lang.code === selectedLangs[0]) return null; // Hide the primary language

              const isSelected = newlyAddedLangs.includes(lang.code);
              return (
                <label 
                  key={lang.code} 
                  className={`protocol-lang-pill small ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleLanguage(lang.code)}
                    disabled={disabled}
                  />
                  {lang.label}
                </label>
              );
            })}
          </div>
          <div className="protocol-lang-add-helper">
            {t("protocolEditor.addNewVariantHelper", "Selecting a language here will generate a new variant for it when you save.")}
          </div>
        </div>

        <div className="protocol-lang-warning">
          💡 <strong>{t("protocolEditor.smartSyncNote")}</strong><br/>
          {t("protocolEditor.smartSyncWarning")}
        </div>
      </div>
    );
  }

  // --- CREATION MODE: Show Multiple Select Pills ---
  return (
    <div className="protocol-field">
      <label className="protocol-label">
        {t("protocolEditor.selectLanguagesToCreate")}
      </label>
      <div className="protocol-lang-pill-container">
        {LANGUAGES.map((lang) => {
          const isSelected = selectedLangs.includes(lang.code);
          return (
            <label 
              key={lang.code} 
              className={`protocol-lang-pill ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleLanguage(lang.code)}
                disabled={disabled}
              />
              {lang.label}
            </label>
          );
        })}
      </div>
      <div className="protocol-lang-helper">
        {t("protocolEditor.createMultipleLangsHelper")}
      </div>
    </div>
  );
}