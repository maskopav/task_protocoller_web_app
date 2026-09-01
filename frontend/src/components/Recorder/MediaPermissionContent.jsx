// src/components/Recorder/MediaPermissionContent.jsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import { SafeButton } from '../Shared/SafeButton';
import './MediaPermissionContent.css';

export default function MediaPermissionContent({
  // identity
  type = 'microphone',        // 'microphone' | 'camera'
  variant = 'intro',          // 'intro' | 'denied' | 'error' ('error': same layout as
                               // 'denied' minus the OS-specific fix-it steps/image —
                               // for failures with no "go to Settings" remedy)

  // optional <h1> — currently invisible app-wide via TaskLayout's
  // SHOW_GLOBAL_TITLES flag, plumbed through so it works if that ever flips
  title = null,
  showSpacer = false,

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
  imageSrc = null,             // overrides the default intro preview image

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
  const showFixItSteps = isDenied; // OS "go to Settings" steps only make sense for a real permission denial
  const assetFolder = type === 'camera' ? 'cameraPermission' : 'microphonePermission';
  const guideText = variant === 'intro' ? introText : deniedText;

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

          {showFixItSteps && (
            <>
              <div className="tab-switcher">
                <SafeButton
                  className={`tab-btn ${osTab === 'android' ? 'active' : ''}`}
                  onClick={() => setOsTab('android')}
                >
                  {t('permissions.tabAndroid')}
                </SafeButton>
                <SafeButton
                  className={`tab-btn ${osTab === 'ios' ? 'active' : ''}`}
                  onClick={() => setOsTab('ios')}
                >
                  {t('permissions.tabIos')}
                </SafeButton>
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
          <SafeButton
            className="btn-primary"
            onClick={onBtnClick}
          >
            {btnText}
          </SafeButton>
          {secondaryControls}
        </>
      }
      {...taskLayoutProps}
    >
      {variant === 'intro' && !imgError && (
        <img
          src={imageSrc || `${baseAssetPath}assets/${assetFolder}/mic_access.png`}
          alt={`${type} permission prompt`}
          className="intro-preview-img"
          onError={() => setImgError(true)}
        />
      )}
    </TaskLayout>
  );
}
