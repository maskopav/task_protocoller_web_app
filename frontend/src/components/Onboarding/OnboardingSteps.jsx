import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export function InfoPage({ content, onNext }) {
  const { t } = useTranslation("common");
  return (
    <div className="onboarding-step">
      <h2>{t("onboarding.infoTitle", "Information")}</h2>
      <div className="onboarding-content">{content}</div>
      <button className="btn-primary" onClick={onNext}>
        {t("buttons.continue", "Continue")}
      </button>
    </div>
  );
}

export function ConsentPage({ content, onNext }) {
  const { t } = useTranslation("common");
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="onboarding-step">
      <h2>{t("onboarding.consentTitle", "Consent")}</h2>
      <div className="onboarding-content">{content}</div>
      <div className="consent-checkbox">
        <input 
          type="checkbox" 
          id="consent-check" 
          checked={agreed} 
          onChange={(e) => setAgreed(e.target.checked)} 
        />
        <label htmlFor="consent-check">
          {t("onboarding.consentCheckbox", "I have read and agree to the terms.")}
        </label>
      </div>
      <button 
        className="btn-primary" 
        disabled={!agreed} 
        onClick={onNext}
      >
        {t("buttons.startProtocol", "I Agree & Start")}
      </button>
    </div>
  );
}