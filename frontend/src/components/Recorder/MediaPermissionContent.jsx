import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './MediaPermissionContent.css';

export const MediaPermissionContent = ({ 
    type = 'microphone',
    variant = 'intro',
    introText,
    deniedText,
    baseAssetPath = import.meta.env.BASE_URL,
    showImage = true, 
    customSteps       
}) => {
    const { t } = useTranslation();
    const [osTab, setOsTab] = useState(() => 
        /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android'
    );
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [osTab]);

    const isCamera = type === 'camera';
    const assetFolder = isCamera ? 'cameraPermission' : 'microphonePermission';

    // ── INTRO VARIANT ──────────────────────────────────────────────
    if (variant === 'intro') {
        return (
            <div className="permission-guide-container flex-col">
                <div className="guide-description">
                    {introText}
                </div>
                {!imgError && (
                    <img
                        src={`${baseAssetPath}assets/${assetFolder}/popup-window.jpeg`}
                        alt={`${type} permission prompt`}
                        className="intro-preview-img"
                        onError={() => setImgError(true)}
                    />
                )}
            </div>
        );
    }

    // ── DENIED VARIANT ─────────────────────────────────────────────
    return (
        <div className="permission-guide-container flex-col">
            <div className="guide-description">
                {deniedText}
            </div>

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

            <div className="instruction-steps">
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
        </div>
    );
};