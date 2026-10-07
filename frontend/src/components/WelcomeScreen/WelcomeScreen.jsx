// src/components/WelcomeScreen/WelcomeScreen.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import { SafeButton } from '../Shared/SafeButton';
import './WelcomeScreen.css';

// First screen for protocols without a language selector. Its only job is the
// "Next" tap: browsers block audio autoplay until the user has interacted with
// the page, so without it the Volume Check clip often wouldn't start on its own.
export default function WelcomeScreen({ onComplete }) {
  const { t } = useTranslation('common');

  return (
    <TaskLayout
      className="welcome-container"
      showSpacer
      instructions={t('welcome.title')}
      controls={
        <SafeButton
          className="btn-next"
          onClick={() => onComplete({ timestamp: new Date().toISOString() })}
        >
          {t('buttons.next')}
        </SafeButton>
      }
    />
  );
}
