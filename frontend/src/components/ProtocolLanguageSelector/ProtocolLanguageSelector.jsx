import React, { useRef, useContext } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../i18n";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext"; 
import "./ProtocolLanguageSelector.css"; 

export default function ProtocolLanguageSelector({ value, onChange, disabled, editingMode }) {
  const { t } = useTranslation(["admin", "common"]);
  const { confirm } = useContext(ConfirmDialogContext);

  const selectedLangs = Array.isArray(value) ? value : (value ? [value] : ["en"]);

  const initialLangsRef = useRef(null);
  if (editingMode && !initialLangsRef.current && value) {
    initialLangsRef.current = selectedLangs;
  }
  const initialLangs = initialLangsRef.current || [];

  const toggleLanguage = async (code) => {
    if (disabled) return;

    // Trigger confirm dialog if they try to add a new variant in EDIT mode
    if (editingMode && !selectedLangs.includes(code)) {
        const confirmed = await confirm({
            title: t("protocolEditor.addVariantTitle"),
            message: t("protocolEditor.addVariantMessage"),
            confirmText: t("common:add", "Add Variant"),
            cancelText: t("common:cancel", "Cancel")
        });
        if (!confirmed) return;
    }

    if (selectedLangs.includes(code)) {
      if (selectedLangs.length === 1) return;
      if (editingMode && initialLangs.includes(code)) return;
      onChange(selectedLangs.filter((c) => c !== code));
    } else {
      onChange([...selectedLangs, code]);
    }
  };

  // --- EDITING MODE ---
  if (editingMode) {
    const missingLangs = LANGUAGES.filter(l => !selectedLangs.includes(l.code));

    return (
      <div className="protocol-field">
        <label className="protocol-label">
          {t("protocolEditor.currentlyEditingLang", "Currently Editing Variant:")}
        </label>
        
        <div className="protocol-lang-badge-container">
          {selectedLangs.map(code => {
            const langObj = LANGUAGES.find(l => l.code === code);
            const isInitial = initialLangs.includes(code);

            if (isInitial) {
              return (
                <div key={code} className="protocol-lang-badge">
                  {langObj?.label || code}
                </div>
              );
            } else {
              return (
                <div 
                  key={code} 
                  className="protocol-lang-badge removable" 
                  onClick={() => toggleLanguage(code)}
                >
                  {langObj?.label || code} ✕
                </div>
              );
            }
          })}
        </div>

        {missingLangs.length > 0 && (
          <div className="protocol-lang-add-section">
            <label className="protocol-lang-add-label">
              ➕ {t("protocolEditor.addNewVariant", "Add New Language Variant")}
            </label>
            <div className="protocol-lang-pill-container">
              {missingLangs.map((lang) => (
                <label 
                  key={lang.code} 
                  className={`protocol-lang-pill small ${disabled ? "disabled" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={false} 
                    onChange={() => toggleLanguage(lang.code)}
                    disabled={disabled}
                  />
                  {lang.code}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- CREATION MODE ---
  return (
    <div className="create-inputs-container">

      <label className="protocol-label">
        {t("protocolEditor.selectLanguagesToCreate")}
      </label>
      
      <div className="protocol-field protocol-lang-pill-container">
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
              {lang.code}
            </label>
          );
        })}
      </div>
    </div>
  );
}