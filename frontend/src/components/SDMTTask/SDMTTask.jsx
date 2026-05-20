import React from 'react';
import { useSDMTLogic } from '../../hooks/useSDMTLogic';
import { useTranslation, Trans } from "react-i18next";

import '../Recorder/Recorder.css'; 
import './SDMTTask.css'; 

const SDMTTask = ({ taskParams, onComplete }) => {
    // Initialize the translation hook for the "tasks" namespace
    const { t } = useTranslation("tasks");
    
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
        handleTap 
    } = useSDMTLogic(duration, onComplete);

    const shouldShowKeypad = 
        !keypadSetting.includes('never') && 
        !(keypadSetting.includes('during') && gameState !== 'playing');

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
                <h1>{t("sdmt.title")}</h1>
                {gameState !== 'playing' && (
                    <>
                        <div className="flexible-spacer"></div>
                        <div className="instruction-card active-instructions sdmt-instructions">
                            <Trans 
                                t={t}
                                i18nKey="sdmt.instructions"
                                values={{ duration }}
                                components={{ strong: <strong /> }}
                            />
                        </div>
                    </>
                )}
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

                    {gameState === 'stats' && (
                        <div className="sdmt-stats">
                            <div className="task-header">
                                {/* Fallback translation for completion state */}
                                <h1>{t("sdmt.taskComplete")}</h1>
                            </div>
                            <p>{t("sdmt.resultsSaved")}</p>
                        </div>
                    )}
                </div>
                {gameState !== 'stats' && renderKeypad()}

            </div>

            <div className="bottom-controls sdmt-bottom-controls">
                {gameState === 'instructions' && (
                    <button className="sdmt-start-btn" onClick={startGame}>
                        {t("sdmt.start")}
                    </button>
                )}
                {gameState === 'playing' && (
                    <div className="sdmt-timer">
                        {t("sdmt.timeLeft")} <span>{timeLeft}s</span>
                    </div>
                )}

            </div>
        </div>
    );
};

export default SDMTTask;