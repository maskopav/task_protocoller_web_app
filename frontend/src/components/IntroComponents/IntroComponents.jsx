import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import 'react-quill-new/dist/quill.snow.css';

export function InfoPage({ content, onNext }) {
  return (
    <div className="onboarding-step">
      <div className="ql-container ql-snow" style={{ border: 'none' }}>
        <div 
          className="ql-editor" 
          dangerouslySetInnerHTML={{ __html: content }} 
        />
      </div>
      <button className="btn-primary" onClick={onNext}>Continue</button>
    </div>
  );
}

export function ConsentPage({ content, onNext }) {
  const { t } = useTranslation("common");
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="onboarding-step">
      <div className="ql-container  ql-snow" style={{ border: 'none' }}>
        <div 
          className="ql-editor" 
          dangerouslySetInnerHTML={{ __html: content }} 
        />
      </div>
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