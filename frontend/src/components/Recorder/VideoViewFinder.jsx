import React, { useEffect, useState, useContext } from 'react';
import { ConfirmDialogContext } from '../ConfirmDialog/ConfirmDialogContext';
import { useTranslation, Trans } from 'react-i18next';
import InfoTooltip from '../InfoToolTip/InfoToolTip';
import { arrowUpIcon, arrowDownIcon, arrowLeftIcon, arrowRightIcon } from '../../assets/arrowIcons/arrowAssets';
import { MediaPermissionContent } from '../Recorder/MediaPermissionContent';

import './VideoViewFinder.css';

// Mirrors the phases used by MicCheck's permission pre-check
const CAM_PERM = {
    CHECKING: 'checking',
    PROMPT: 'prompt',
    GRANTED: 'granted',
    DENIED: 'denied',
};

export const VideoViewFinder = ({
    phase, 
    videoRecorder, 
    isRecording,
    onStartCalibration,
    onFinishCalibration,
    permissionDenied = false
}) => {
    const { confirm } = useContext(ConfirmDialogContext);
    const { t } = useTranslation();
    const [setupCancelled, setSetupCancelled] = useState(false);
    const [camPermState, setCamPermState] = useState(CAM_PERM.CHECKING);
    const [permissionAcknowledged, setPermissionAcknowledged] = useState(false);
    
    const { 
        videoRef, canvasRef, isSteady, isFaceCorrect, guidance, faceMessage, isLoadingModel
    } = videoRecorder;

    const showWarningBorder = isRecording && (!isSteady || !isFaceCorrect);

    // ── CAMERA PERMISSION PRE-CHECK ───────────────────────────────
    // Runs once on mount so we know, before showing any task/setup
    // instructions, whether we need to warn the user about the
    // upcoming camera prompt or guide them through a denied state.
    useEffect(() => {
        let permissionStatus;

        const toState = (state) => (
            state === 'granted' ? CAM_PERM.GRANTED :
            state === 'denied'  ? CAM_PERM.DENIED  :
            CAM_PERM.PROMPT
        );

        async function checkCameraPermission() {
            if (!navigator.permissions?.query) {
                // Browsers without the Permissions API (e.g. Safari) simply
                // fall back to treating it as "not yet asked".
                setCamPermState(CAM_PERM.PROMPT);
                return;
            }
            try {
                permissionStatus = await navigator.permissions.query({ name: 'camera' });
                setCamPermState(toState(permissionStatus.state));
                permissionStatus.onchange = () => {
                    setCamPermState(toState(permissionStatus.state));
                };
            } catch (error) {
                setCamPermState(CAM_PERM.PROMPT);
            }
        }

        checkCameraPermission();
        return () => {
            if (permissionStatus) permissionStatus.onchange = null;
        };
    }, []);

    // A getUserMedia() failure (explicit block, or a dismissed prompt that
    // the Permissions API doesn't reflect) is reported by the parent via this
    // prop. Treat it exactly like the Permissions API reporting 'denied'.
    useEffect(() => {
        if (permissionDenied) {
            setCamPermState(CAM_PERM.DENIED);
        }
    }, [permissionDenied]);

    const instructionList = (
        <div className="calibration-instructions-layout">
            
            {/* ILLUSTRATION: Make sure this shows the participant holding the phone on the table */}
            <img 
                src={`${import.meta.env.BASE_URL}assets/sittingInstructions/sitting-instructions-camera.svg`}
                alt="Correct sitting posture" 
                className="posture-illustration" 
            />
            <div className="instruction-steps">
                <Trans i18nKey="videoCalibration.step1">
                </Trans>
            </div>
        </div>
    );

    const showInstructionsDialog = async () => {
        return await confirm({
            title: t('videoCalibration.setupTitle'),
            message: instructionList,
            confirmText: t('videoCalibration.btnReady'),
            cancelText: t('videoCalibration.btnCancel')
        });
    };

    // The task instructions dialog should only auto-open once we're past
    // the camera permission gate: not while we're still checking, not
    // while the user hasn't acknowledged the upcoming browser prompt yet,
    // and not at all if permission has been explicitly denied.
    const pastPermissionGate =
        camPermState === CAM_PERM.GRANTED ||
        (camPermState === CAM_PERM.PROMPT && permissionAcknowledged);

    useEffect(() => {
        if (phase === 'SETUP' && !setupCancelled && pastPermissionGate) {
            const autoStart = async () => {
                const isReady = await showInstructionsDialog();
                if (isReady) onStartCalibration(); 
                else setSetupCancelled(true); 
            };
            autoStart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, setupCancelled, pastPermissionGate]); 

    // ── CAMERA PERMISSION DENIED ──────────────────────────────────
    // Shown instead of ANY phase content (SETUP, CALIBRATE, RECORDING...)
    // until permission is granted. The onchange listener above will
    // flip camPermState if the user fixes it in browser settings.
    if (camPermState === CAM_PERM.DENIED) {
        return (
            <div className="permission-standalone-card">
                <MediaPermissionContent
                    type="camera"
                    variant="denied"
                    deniedText={<Trans i18nKey="videoCalibration.guide.descDenied" />}
                    customSteps={(osTab) => (
                        <Trans i18nKey={`videoCalibration.guide.steps.${osTab}`} />
                    )}
                />
                <div className="video-bottom-controls">
                    <button
                        className="btn-primary"
                        onClick={() => {
                            // Optimistically go back to "checking" and let the parent
                            // re-attempt getUserMedia — this re-triggers the native
                            // prompt if the browser still allows asking again.
                            setCamPermState(CAM_PERM.CHECKING);
                            onStartCalibration();
                        }}
                    >
                        {t('videoCalibration.guide.btnRetry')}
                    </button>
                </div>
            </div>
        );
    }

    // ── CAMERA PERMISSION INTRO ───────────────────────────────────
    // Shown before ANY phase content so the user knows a browser
    // permission popup is coming, exactly as MicCheck does for the
    // microphone — regardless of what `phase` the parent has set.
    if (camPermState === CAM_PERM.PROMPT && !permissionAcknowledged) {
        return (
            <div className="permission-standalone-card">
                <MediaPermissionContent
                    type="camera"
                    variant="intro"
                    introText={
                        <>
                            <Trans i18nKey="videoCalibration.permissionWarning" />
                            <br /><br />
                            <Trans i18nKey="videoCalibration.permissionInstruction" />
                        </>
                    }
                />
                <div className="video-bottom-controls">
                    <button
                        className="btn-primary"
                        onClick={() => setPermissionAcknowledged(true)}
                    >
                        {t('videoCalibration.btnUnderstand')}
                    </button>
                </div>
            </div>
        );
    }

    // ── CAMERA PERMISSION STILL RESOLVING ─────────────────────────
    // Very brief (permissions.query resolves almost immediately), but
    // we still shouldn't flash any task content while we wait.
    if (camPermState === CAM_PERM.CHECKING) {
        return null;
    }

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