import React, { useEffect, useState, useContext } from 'react';
import { ConfirmDialogContext } from '../ConfirmDialog/ConfirmDialogContext';
import { useTranslation, Trans } from 'react-i18next';
import InfoTooltip from '../InfoToolTip/InfoToolTip';
import { arrowUpIcon, arrowDownIcon, arrowLeftIcon, arrowRightIcon } from '../../assets/arrowIcons/arrowAssets';

import './VideoViewFinder.css';

export const VideoViewFinder = ({
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
        videoRef, canvasRef, isSteady, isFaceCorrect, guidance, faceMessage, isLoadingModel
    } = videoRecorder;

    const showWarningBorder = isRecording && (!isSteady || !isFaceCorrect);

    const instructionList = (
        <div className="calibration-instructions-layout">
            
            {/* ILLUSTRATION: Make sure this shows the participant holding the phone on the table */}
            <img 
                src={`${import.meta.env.BASE_URL}assets/sittingInstructions/sitting-instructions-camera.png`}
                alt="Correct sitting posture" 
                className="posture-illustration" 
            />
            <div className="instruction-steps">
                <li>
                    <Trans i18nKey="videoCalibration.step1">
                    </Trans>
                </li>
                <li>
                    <Trans i18nKey="videoCalibration.step2">
                    </Trans>
                </li>
                <li>
                    <Trans i18nKey="videoCalibration.step3">
                    </Trans>
                </li>
                <li>
                    <Trans i18nKey="videoCalibration.step4">
                    </Trans>
                </li>
            </div>
        </div>
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
                            <div className={`face-oval ${isSteady && isFaceCorrect && !isLoadingModel ? 'ready' : ''}`}>
                                
                            {/* SHOW LOADING STATE IF DOWNLOADING AI */}
                            {isLoadingModel && (
                                <div className="calib-text-badge loading-badge">
                                    <div className="model-spinner"></div>
                                    {t('videoCalibration.loadingAI')}
                                </div>
                            )}

                            {/* SHOW GUIDANCE ONLY WHEN FULLY LOADED */}
                            {!isLoadingModel && (
                                <>
                                    {guidance?.arrow === 'MOVE_DOWN' && <div className="calib-icon arrow-up"><img src={arrowUpIcon} alt="Up" /></div>}
                                    {guidance?.arrow === 'MOVE_UP' && <div className="calib-icon arrow-down"><img src={arrowDownIcon} alt="Down" /></div>}
                                    {guidance?.arrow === 'MOVE_LEFT' && <div className="calib-icon arrow-left"><img src={arrowLeftIcon} alt="Left" /></div>}
                                    {guidance?.arrow === 'MOVE_RIGHT' && <div className="calib-icon arrow-right"><img src={arrowRightIcon} alt="Right" /></div>}
                                    
                                    {guidance?.arrow === 'MOVE_CLOSER' && <div className="calib-text-badge">{t('videoCalibration.closer', 'Closer')}</div>}
                                    {guidance?.arrow === 'MOVE_FURTHER' && <div className="calib-text-badge">{t('videoCalibration.further', 'Further')}</div>}
                                    {guidance?.arrow === 'TURN_LEFT' && <div className="calib-text-badge">{t('videoCalibration.turnLeft', 'Look Left')}</div>}
                                    {guidance?.arrow === 'TURN_RIGHT' && <div className="calib-text-badge">{t('videoCalibration.turnRight', 'Look Right')}</div>}
                                </>
                            )}
                            </div>
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