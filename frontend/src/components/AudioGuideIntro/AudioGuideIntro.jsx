// src/components/AudioGuideIntro/AudioGuideIntro.jsx
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MediaPermissionContent from '../Recorder/MediaPermissionContent';

// Intro step explaining the header audio guide icon. The sample clip itself is
// played by the page-level header AudioGuidePlayer (audio_guide_intro.m4a),
// resolved from the task category like any other task — no audio wiring here.
export default function AudioGuideIntro({ onComplete }) {
  const { t } = useTranslation('common');

  return (
    <MediaPermissionContent
      variant="intro"
      title={t('audioGuideIntro.title')}
      introText={<Trans t={t} i18nKey="audioGuideIntro.instructions" />}
      imageSrc={`${import.meta.env.BASE_URL}assets/audioGuide/audio_guide_example_icon.png`}
      btnText={t('buttons.continue')}
      onBtnClick={() => onComplete({ timestamp: new Date().toISOString() })}
    />
  );
}