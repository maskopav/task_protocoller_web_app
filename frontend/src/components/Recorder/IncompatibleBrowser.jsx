// components/Recorder/IncompatibleBrowser.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './IncompatibleBrowser.css';

import chromeIcon from '../../assets/browsers/chrome.png';
import safariIcon from '../../assets/browsers/safari.jpg';
import operaIcon from '../../assets/browsers/opera.png';
import edgeIcon from '../../assets/browsers/edge.png';

const BROWSERS = [
    { name: 'Chrome', icon: chromeIcon },
    { name: 'Safari', icon: safariIcon },
    { name: 'Opera',  icon: operaIcon },
    { name: 'Edge',   icon: edgeIcon }
];

export const IncompatibleBrowser = ({ browserName }) => {
    const { t } = useTranslation('common');
    const url = sessionStorage.getItem('originalParticipantUrl') || window.location.href;
    const [copied, setCopied] = useState(false);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            prompt(t('incompatibleBrowser.fallbackPrompt'), url);
        }
    };

    return (
        <div className="ib-overlay">
            <div className="ib-card">
                <div className="ib-icon">⚠️</div>
                <h2 className="ib-title">{t('incompatibleBrowser.title')}</h2>
                <p className="ib-description">
                    <strong>{browserName}</strong> {t('incompatibleBrowser.description')}
                </p>
                <p className="ib-instruction">
                    {t('incompatibleBrowser.instruction')}
                </p>
                <div className="ib-browsers">
                    {BROWSERS.map(b => (
                        <div key={b.name} className="ib-browser-item">
                            <div className="ib-browser-icon">
                                <img src={b.icon} alt={`${b.name} browser`} width="40" height="40" />
                            </div>
                            <span className="ib-browser-name">{b.name}</span>
                        </div>
                    ))}
                </div>
                <div className="ib-url-box">
                    <span className="ib-url-text">{url}</span>
                </div>
                <button className={`ib-copy-btn ${copied ? 'ib-copy-btn--copied' : ''}`} onClick={copyLink}>
                    {copied ? t('incompatibleBrowser.copied') : t('incompatibleBrowser.copyBtn')}
                </button>
            </div>
        </div>
    );
};