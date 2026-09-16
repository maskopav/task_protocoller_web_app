import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from 'dompurify';
import 'react-quill-new/dist/quill.snow.css';
import TaskLayout from '../TaskLayout/TaskLayout';
import { SafeButton } from '../Shared/SafeButton';

export const extractTitleAndBody = (rawContent) => {
  if (!rawContent) return { title: null, body: '' };

  const basePath = (import.meta.env.VITE_APP_BASE_PATH || '/').replace(/\/$/, '');
  const adjustedContent = rawContent.replace(/src="\//g, `src="${basePath}/`);

  const doc = new DOMParser().parseFromString(adjustedContent.replace(/&nbsp;/g, ' '), 'text/html');
  const h1 = doc.querySelector('h1');
  const title = h1 ? h1.textContent : null;
  if (h1) h1.remove();

  // Remove inline font-size and line-height so CSS controls sizing uniformly
  doc.querySelectorAll('[style]').forEach((el) => {
    el.style.fontSize = '';
    el.style.lineHeight = '';
  });

  // This HTML is admin-authored (protocol_contents.text_html) and rendered
  // straight into every participant's browser via dangerouslySetInnerHTML
  // below. Sanitize right here, at the last point before that render, so a
  // compromised or malicious admin account can't run script against
  // participants (e.g. via <img src=x onerror=...>, which dangerouslySetInnerHTML
  // does NOT block on its own — only <script> tags are inert that way).
  const body = DOMPurify.sanitize(doc.body.innerHTML);

  return { title, body };
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