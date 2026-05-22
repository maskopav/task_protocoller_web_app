import React, { useMemo, useEffect, useContext, useRef } from 'react';
import { useSDMTLogic } from '../../hooks/useSDMTLogic';
import { useTranslation, Trans } from "react-i18next";
import { NextTaskButton } from '../Recorder/NextTaskButton';
import { ConfirmDialogContext } from '../ConfirmDialog/ConfirmDialogContext';
import InfoTooltip from '../InfoTooltip/InfoTooltip';
import SDMTDemoMessage from './SDMTDemoMessage';
import './SDMTTask.css'; 

const SDMTTask = ({ taskParams, onComplete }) => {
    // Initialize the translation hook for the "tasks" namespace
    const { t } = useTranslation("tasks", "common");
    const { confirm } = useContext(ConfirmDialogContext);
    const demoShownRef = useRef(false);
    
    const rawDuration = Array.isArray(taskParams?.duration) ? taskParams.duration[0] : taskParams?.duration;
    const duration = Number(rawDuration) || 90;

    const rawKeypad = Array.isArray(taskParams?.showKeypad) ? taskParams.showKeypad[0] : taskParams?.showKeypad;
    const keypadSetting = String(rawKeypad ?? 'always').toLowerCase();

    const { 
        gameState, 
        timeLeft, 
        currentSymbol, 
        isSymbolVisible, 
        startGame, 
        handleTap, 
        stopGame,
        resetGame
    } = useSDMTLogic(duration, onComplete);

    useEffect(() => {
        const showDemoDialog = async () => {
            if (!demoShownRef.current && gameState === 'instructions') {
                demoShownRef.current = true;
                await confirm({
                    title: t("sdmt.demoTitle"),
                    message: <SDMTDemoMessage />, 
                    infoOnly: true
                });
            }
        };
        showDemoDialog();
    }, [gameState, confirm, t]);

    const shouldShowKeypad = 
        !keypadSetting.includes('never') && 
        !(keypadSetting.includes('during') && gameState !== 'playing');

    const instructionConfig = useMemo(() => {
        if (gameState === 'stats') {
            return { key: "completion.taskCompletedInstructions", ns: "common" };
        } else if (gameState === 'playing') {
            return { key: "sdmt.instructionsActive", ns: "tasks" };
        } else {
            return { key: "sdmt.instructions", ns: "tasks" };
        }
    }, [gameState]);

    const renderReferenceKey = () => (
        <div className="sdmt-reference-key">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <div key={`key-${num}`} className="sdmt-key-item">
                    <img src={`${import.meta.env.VITE_APP_BASE_PATH}assets/sdmt/sdmt${num}.svg`} alt={`Symbol ${num}`} className="sdmt-key-img"/>
                    <div className="sdmt-key-number">{num}</div>
                </div>
            ))}
        </div>
    );

    const renderKeypad = () => {
        if (!shouldShowKeypad) return null;

        return (
            <div className="sdmt-keypad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button 
                        key={`btn-${num}`} 
                        className="sdmt-keypad-btn"
                        onClick={() => handleTap(num)}
                    >
                        {num}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="task-container sdmt-container">
            
            {/* HEADER */}  
            <div className="task-header sdmt-header-wrapper">
                <h1>
                    {t("sdmt.title")}
                    <InfoTooltip 
                        title={t("sdmt.demoTitle")}
                        text={<SDMTDemoMessage />} 
                    />
                </h1>
                {gameState !== 'playing' && (
                    <div className="flexible-spacer"></div>
                )}
                <div className={`instruction-card active-instructions sdmt-instructions ${gameState === 'playing' ? 'no-title' : ''}`}>
                    <Trans 
                        t={t}
                        i18nKey={instructionConfig.key}
                        ns={instructionConfig.ns}
                        values={{ duration }}
                    />
                </div>
            </div>

            <div className="recording-area sdmt-main-interface">
                {gameState === 'playing' && renderReferenceKey()}

                <div className="sdmt-center-area">

                    {gameState === 'playing' && (
                        <div className="sdmt-active-symbol-container">
                            {isSymbolVisible && currentSymbol ? (
                                <img 
                                    src={`${import.meta.env.VITE_APP_BASE_PATH}assets/sdmt/sdmt${currentSymbol}.svg`} 
                                    alt="Current Symbol" 
                                    className="sdmt-active-symbol fade-scale-in"
                                />
                            ) : (
                                <div className="sdmt-symbol-placeholder"></div>
                            )}
                        </div>
                    )}
                </div>
                {gameState !== 'stats' && renderKeypad()}

            </div>

            <div className="bottom-controls sdmt-bottom-controls">
                {gameState === 'instructions' && (
                    <button className="btn-start" onClick={startGame}>
                        {t("sdmt.start")}
                    </button>
                )}
                {gameState === 'playing' && (
                    <>
                        <button className="btn-stop" onClick={stopGame}>
                            {t("buttons.stop", { ns: "common" })}
                        </button>
                        <div className="sdmt-timer">
                            <span>{timeLeft}s</span>
                        </div>
                    </>
                )}
                {gameState === 'stats' && (
                    <>
                    <button className="btn-reset" onClick={resetGame}>
                        {t("buttons.repeat", { ns: "common" })}
                    </button>
                    <NextTaskButton onClick={onComplete} />
                    </>
                )}

            </div>
        </div>
    );
};

export default SDMTTask;