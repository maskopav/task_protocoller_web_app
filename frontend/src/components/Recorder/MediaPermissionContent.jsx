// src/components/Recorder/MediaPermissionContent.jsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import './MediaPermissionContent.css';

/**
 * MediaPermissionContent — a full-screen permission guide built on TaskLayout,
 * following the same pattern as SDMTTask: instructions live in TaskLayout's
 * own instruction-card (header), and everything else — the OS tab switcher,
 * the screenshot, the step text — is styled directly on the main area via
 * `mainClassName`, no extra wrapper div needed. The action button sits in
 * TaskLayout's bottom controls via `controlsClassName`. One component works
 * for both the microphone and camera permission flows — just switch `type`.
 */
export default function MediaPermissionContent({
  // identity
  type = 'microphone',        // 'microphone' | 'camera'
  variant = 'intro',          // 'intro' | 'denied'

  // optional <h1> — currently invisible app-wide via TaskLayout's
  // SHOW_GLOBAL_TITLES flag, plumbed through so it works if that ever flips
  title = null,
  showSpacer = true,

  // TaskLayout zone classes, following the SDMTTask convention
  className = 'media-permission-container',
  instructionsClassName = 'media-permission-instructions',
  mainClassName = 'media-permission-main',
  controlsClassName = 'media-permission-controls',

  // lead-in text, rendered as TaskLayout's instructions
  introText,
  deniedText,

  // main area content
  showImage = true,
  customSteps,                 // (osTab) => node — used for variant="denied" only
  baseAssetPath = import.meta.env.BASE_URL,

  // bottom controls
  btnText,
  onBtnClick,
  secondaryControls = null,    // e.g. a "skip" link rendered next to the primary button

  // escape hatch for any other TaskLayout prop a caller needs
  taskLayoutProps = {},
}) {
  const { t } = useTranslation();
  const [osTab, setOsTab] = useState(() =>
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android'
  );
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [osTab]);

  const isDenied = variant === 'denied';
  const assetFolder = type === 'camera' ? 'cameraPermission' : 'microphonePermission';
  const guideText = isDenied ? deniedText : introText;

  return (
    <TaskLayout
      className={className}
      title={title}
      showSpacer={showSpacer}
      instructions={
        <>
          {guideText != null && (
            <div className="guide-description">{guideText}</div>
          )}

          {isDenied && (
            <>
              <div className="tab-switcher">
                <button
                  className={`tab-btn ${osTab === 'android' ? 'active' : ''}`}
                  onClick={() => setOsTab('android')}
                >
                  {t('permissions.tabAndroid')}
                </button>
                <button
                  className={`tab-btn ${osTab === 'ios' ? 'active' : ''}`}
                  onClick={() => setOsTab('ios')}
                >
                  {t('permissions.tabIos')}
                </button>
              </div>

              <div className="guide-instruction-steps">
                <div className="solution-label">
                  {t('permissions.howToFix')}
                </div>

                {showImage && !imgError && (
                  <img
                    src={`${baseAssetPath}assets/${assetFolder}/guide-${osTab}.png`}
                    alt={`How to fix ${type} on ${osTab}`}
                    className="instruction-image"
                    onError={() => setImgError(true)}
                  />
                )}

                <div className="steps-text-block">
                  {customSteps && customSteps(osTab)}
                </div>
              </div>
            </>
          )}
        </>
      }
      instructionsClassName={instructionsClassName}
      mainClassName={mainClassName}
      controlsClassName={controlsClassName}
      controls={
        <>
          <button
            className="btn-primary"
            onClick={onBtnClick}
          >
            {btnText}
          </button>
          {secondaryControls}
        </>
      }
      {...taskLayoutProps}
    >
      {!isDenied && !imgError && (
        <img
          src={`${baseAssetPath}assets/${assetFolder}/popup-window.jpeg`}
          alt={`${type} permission prompt`}
          className="intro-preview-img"
          onError={() => setImgError(true)}
        />
      )}
    </TaskLayout>
  );
}
