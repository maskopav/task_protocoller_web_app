import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import 'react-quill-new/dist/quill.snow.css';
import TaskLayout from '../TaskLayout/TaskLayout'; 

// Helper function to extract <h1> and return the remaining HTML
const extractTitleAndBody = (rawContent) => {
  if (!rawContent) return { title: null, body: '' };
  
  const safeContent = rawContent.replace(/&nbsp;/g, ' ');
  const parser = new DOMParser();
  const doc = parser.parseFromString(safeContent, 'text/html');
  
  const h1 = doc.querySelector('h1');
  const title = h1 ? h1.textContent : null; // Extract just the text for the TaskLayout prop
  
  if (h1) {
    h1.remove(); // Strip the <h1> out of the rich text body
  }
  
  return {
    title,
    body: doc.body.innerHTML
  };
};

export function InfoPage({ content, onNext }) {
  const { t } = useTranslation("common");
  const { title, body } = useMemo(() => extractTitleAndBody(content), [content]);

  const instructionsContent = (
    <div 
      className="participant-rich-text" 
      dangerouslySetInnerHTML={{ __html: body }} 
    />
  );

  const controlsContent = (
    <button className="btn-primary" onClick={onNext}>
      {t("buttons.continue")}
    </button>
  );

  return (
    <TaskLayout
      title={title}
      renderTitle={true}
      instructions={instructionsContent}
      instructionsClassName="no-title align-left"
      controls={controlsContent}
    />
  );
}

export function ConsentPage({ content, onNext }) {
  const { t } = useTranslation("common");
  const [agreed, setAgreed] = useState(false);
  const { title, body } = useMemo(() => extractTitleAndBody(content), [content]);

  const instructionsContent = (
    <div 
      className="participant-rich-text" 
      dangerouslySetInnerHTML={{ __html: body }} 
    />
  );

  const controlsContent = (
    <>
      <div className="consent-checkbox">
        <input 
          type="checkbox" 
          id="consent-check" 
          checked={agreed} 
          onChange={(e) => setAgreed(e.target.checked)} 
        />
        <label htmlFor="consent-check">
          {t("onboarding.consentCheckbox")}
        </label>
      </div>
      <button 
        className="btn-primary" 
        disabled={!agreed} 
        onClick={onNext}
      >
        {t("buttons.startProtocol")}
      </button>
    </>
  );

  return (
    <TaskLayout
      title={title}
      renderTitle={true}
      instructions={instructionsContent}
      instructionsClassName="no-title align-left"
      controls={controlsContent}
    />
  );
}