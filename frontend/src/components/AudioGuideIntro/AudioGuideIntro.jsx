// src/components/AudioGuideIntro/AudioGuideIntro.jsx
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import { SafeButton } from '../Shared/SafeButton';

// Intro step explaining the header audio guide icon. The sample clip itself is
// played by the page-level header AudioGuidePlayer (audio_guide_intro.m4a),
// resolved from the task category like any other task — no audio wiring here.
export default function AudioGuideIntro({ onComplete }) {
  const { t } = useTranslation('common');

  return (
    <TaskLayout
      title={t('audioGuideIntro.title')}
      showSpacer={true}
      instructions={
        <div className="guide-description">
          <Trans t={t} i18nKey="audioGuideIntro.instructions" />
        </div>
      }
      instructionsClassName="media-permission-instructions"
      mainClassName="media-permission-main"
      controlsClassName="media-permission-controls"
      controls={
        <SafeButton
          className="btn-next"
          onClick={() => onComplete({ timestamp: new Date().toISOString() })}
        >
          {t('buttons.next')}
        </SafeButton>
      }
    >
      <img
        src={`${import.meta.env.BASE_URL}assets/audioGuide/audio_guide_example_icon.png`}
        alt="Audio Guide Example"
        className="intro-preview-img"
      />
    </TaskLayout>
  );
}