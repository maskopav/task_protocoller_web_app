import React, { useEffect, useState, useContext } from 'react';
import { ConfirmDialogContext } from '../ConfirmDialog/ConfirmDialogContext';
import { useTranslation, Trans } from 'react-i18next';
import InfoTooltip from '../InfoToolTip/InfoToolTip';

// Import your custom SVGs from your assets destination
import arrowUpIcon from '../../assets/arrow-up.svg';
import arrowDownIcon from '../../assets/arrow-down.svg';
import arrowLeftIcon from '../../assets/arrow-left.svg';
import arrowRightIcon from '../../assets/arrow-right.svg';

import './VideoViewfinder.css';

export const VideoViewfinder = ({ 
    phase, 
    videoRecorder, 
    isRecording,
    onStartCalibration,
    onFinishCalibration
}) => {
    const { confirm } = useContext(ConfirmDialogContext);
    const { t } = useTranslation();
    const [setupCancelled, setSetupCancelled] = useState(false);
    
    const { 
        videoRef, canvasRef, isSteady, isFaceCorrect, guidance, faceMessage 
    } = videoRecorder;

    const showWarningBorder = isRecording && (!isSteady || !isFaceCorrect);

    const instructionList = (
        <ul style={{ textAlign: 'left', lineHeight: '1.6', paddingLeft: '20px', fontSize: '1.1rem' }}>
            <li>
                <Trans i18nKey="videoCalibration.step1">
                    📱 <strong>Place your device on a table</strong> leaning against a stable object.
                </Trans>
            </li>
            <li>
                <Trans i18nKey="videoCalibration.step2">
                    📏 <strong>Sit one arm's length away</strong> from the screen.
                </Trans>
            </li>
            <li>
                <Trans i18nKey="videoCalibration.step3">
                    <strong>Rest your hands on the table</strong> comfortably.
                </Trans>
            </li>
            <li>{t('videoCalibration.step4', '💡 Ensure your face is well-lit.')}</li>
        </ul>
    );

    const showInstructionsDialog = async () => {
        return await confirm({
            title: t('videoCalibration.setupTitle', 'Setup Instructions'),
            message: instructionList,
            confirmText: t('videoCalibration.btnReady', "I'm Ready"),
            cancelText: t('videoCalibration.btnCancel', "Cancel")
        });
    };

    useEffect(() => {
        if (phase === 'SETUP' && !setupCancelled) {
            const autoStart = async () => {
                const isReady = await showInstructionsDialog();
                if (isReady) onStartCalibration(); 
                else setSetupCancelled(true); 
            };
            autoStart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, setupCancelled]); 

    return (
        <>
            <div className={`viewfinder-container ${phase === 'RECORDING' ? 'pip-mode' : ''} ${showWarningBorder ? 'warning-border' : ''}`}>
                <video ref={videoRef} autoPlay playsInline muted className="viewfinder" />
                
                {phase === 'CALIBRATE' && (
                    <>
                        <canvas ref={canvasRef} className="mesh-canvas" />
                        
                        <div className="calibration-overlay">
                            <div className={`face-oval ${isSteady && isFaceCorrect ? 'ready' : ''}`}>
                                
                                {/* 1. SVGs for directional movement */}
                                {guidance?.arrow === 'MOVE_UP' && <div className="calib-icon arrow-up"><img src={arrowDownIcon} alt="Down" /></div>}
                                {guidance?.arrow === 'MOVE_DOWN' && <div className="calib-icon arrow-down"><img src={arrowUpIcon} alt="Up" /></div>}
                                {guidance?.arrow === 'MOVE_LEFT' && <div className="calib-icon arrow-left"><img src={arrowRightIcon} alt="Right" /></div>}
                                {guidance?.arrow === 'MOVE_RIGHT' && <div className="calib-icon arrow-right"><img src={arrowLeftIcon} alt="Left" /></div>}
                                
                                {/* 2. Pulsing Text Badges for Zoom/Rotation/Ready states */}
                                {guidance?.arrow === 'MOVE_CLOSER' && <div className="calib-text-badge">{t('videoCalibration.closer', 'Closer')}</div>}
                                {guidance?.arrow === 'MOVE_FURTHER' && <div className="calib-text-badge">{t('videoCalibration.further', 'Further')}</div>}
                                {guidance?.arrow === 'TURN_LEFT' && <div className="calib-text-badge">{t('videoCalibration.turnLeft', 'Look Left')}</div>}
                                {guidance?.arrow === 'TURN_RIGHT' && <div className="calib-text-badge">{t('videoCalibration.turnRight', 'Look Right')}</div>}
                                {/*{guidance?.arrow === 'READY' && <div className="calib-text-badge success">{t('videoCalibration.perfect', 'Perfect')}</div>}*/}

                            </div>
                            
                            {/* The old .warning-toast has been completely removed! */}
                        </div>
                    </>
                )}

                {phase === 'RECORDING' && showWarningBorder && (
                    <div className="recording-alert-overlay">
                        <div className="alert-box">
                            ⚠️ {!isSteady 
                                ? t('videoCalibration.warningHoldSteady', "Hold Phone Steady!") 
                                : (faceMessage || t('videoCalibration.warningAdjustFace', "Adjust your face!"))}
                        </div>
                    </div>
                )}
            </div>

            {phase === 'CALIBRATE' && (
                <div className="viewfinder-under-info">
                    <InfoTooltip title={t('videoCalibration.setupTitle')} text={instructionList} />
                    <span className="info-text-label" onClick={showInstructionsDialog}>
                        {t('videoCalibration.viewInstructions', 'View Setup Instructions')}
                    </span>
                </div>
            )}

            {phase === 'SETUP' && setupCancelled && (
                <div className="video-bottom-controls">
                    <button className="btn-primary" onClick={() => setSetupCancelled(false)}>
                        {t('videoCalibration.btnShowInstructions')}
                    </button>
                </div>
            )}

            {phase === 'CALIBRATE' && (
                <div className="video-bottom-controls">
                    <button 
                        className="btn-primary" 
                        disabled={!(isSteady && isFaceCorrect)} 
                        onClick={onFinishCalibration}
                    >
                        {(isSteady && isFaceCorrect) 
                            ? t('videoCalibration.btnContinueReady') 
                            : t('videoCalibration.btnContinueWait')}
                    </button>
                </div>
            )}
        </>
    );
};