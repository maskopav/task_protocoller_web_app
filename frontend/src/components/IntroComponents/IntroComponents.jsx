import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import 'react-quill-new/dist/quill.snow.css';
import TaskLayout from '../TaskLayout/TaskLayout'; 
import { SafeButton } from '../Shared/SafeButton';

const extractTitleAndBody = (rawContent) => {
  if (!rawContent) return { title: null, body: '' };
  
  // 1. Strip trailing slash from base path (e.g., "/test/dist/" becomes "/test/dist")
  const basePath = (import.meta.env.VITE_APP_BASE_PATH || '/').replace(/\/$/, '');
  
  // 2. Regex: Find all src="/ and inject the base path right after the quote
  const adjustedContent = rawContent.replace(/src="\//g, `src="${basePath}/`);

  // 3. Parse and extract as usual
  const doc = new DOMParser().parseFromString(adjustedContent.replace(/&nbsp;/g, ' '), 'text/html');
  const h1 = doc.querySelector('h1');
  const title = h1 ? h1.textContent : null;
  if (h1) h1.remove();

  return { title, body: doc.body.innerHTML };
};

export function InfoPage({ content, onNext }) {
  const { t } = useTranslation("common");
  const { title, body } = useMemo(() => extractTitleAndBody(content), [content]);

  return (
    <TaskLayout
      title={title}
      renderTitle={true}
      instructions={
        <div 
          className="participant-rich-text" 
          dangerouslySetInnerHTML={{ __html: body }} 
        />
      }
      instructionsClassName="align-left" 
      controls={
        <SafeButton className="btn-next" onClick={onNext}>
          {t("buttons.next")}
        </SafeButton>
      }
    />
  );
}

export function ConsentPage({ content, onNext }) {
  const { t } = useTranslation("common");
  const [agreed, setAgreed] = useState(false);
  const { title, body } = useMemo(() => extractTitleAndBody(content), [content]);

  return (
    <TaskLayout
      title={title}
      renderTitle={true}
      instructions={
        <div 
          className="participant-rich-text" 
          dangerouslySetInnerHTML={{ __html: body }} 
        />
      }
      instructionsClassName="align-left"
      controls={
        <>
          <div className="consent-checkbox">
            <input 
              type="checkbox" 
              id="consent-check" 
              checked={agreed} 
              onChange={(e) => setAgreed(e.target.checked)} 
            />
            <label htmlFor="consent-check">{t("onboarding.consentCheckbox")}</label>
          </div>
          <SafeButton className="btn-primary" disabled={!agreed} onClick={onNext}>
            {t("buttons.startProtocol")}
          </SafeButton>
        </>
      }
    />
  );
}