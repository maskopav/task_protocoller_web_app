import React, { useMemo, useEffect, useContext, useRef } from 'react';
import { useSDMTLogic } from '../../hooks/useSDMTLogic';
import { useTranslation, Trans } from "react-i18next";
import { NextTaskButton } from '../Recorder/NextTaskButton';
import { ConfirmDialogContext } from '../ConfirmDialog/ConfirmDialogContext';
import InfoTooltip from '../InfoToolTip/InfoToolTip';
import SDMTDemoMessage from './SDMTDemoMessage';
import TaskLayout from '../TaskLayout/TaskLayout';
import './SDMTTask.css';

const SDMTTask = ({ taskParams, onComplete }) => {
    const { t } = useTranslation("tasks", "common");
    const { confirm } = useContext(ConfirmDialogContext);
    const demoShownRef = useRef(false);

    const rawDuration  = Array.isArray(taskParams?.duration)       ? taskParams.duration[0]       : taskParams?.duration;
    const rawKeypad    = Array.isArray(taskParams?.showKeypad)      ? taskParams.showKeypad[0]     : taskParams?.showKeypad;
    const rawOrdering  = Array.isArray(taskParams?.symbolOrdering)  ? taskParams.symbolOrdering[0] : taskParams?.symbolOrdering;

    const duration       = Number(rawDuration) || 90;
    const keypadSetting  = String(rawKeypad ?? 'always').toLowerCase();
    const symbolOrdering = rawOrdering || 'fixed_by_run';
    const repeatIndex    = taskParams?.repeatIndex || 1;

    const {
        gameState,
        timeLeft,
        currentSymbol,
        isSymbolVisible,
        referenceMap,
        results,
        startGame,
        handleTap,
        stopGame,
        resetGame,
    } = useSDMTLogic(duration, symbolOrdering, repeatIndex);

    // ── Show demo dialog once on mount ────────────────────────────────
    useEffect(() => {
        const showDemoDialog = async () => {
            if (!demoShownRef.current && gameState === 'instructions') {
                demoShownRef.current = true;
                await confirm({
                    title:    t("sdmt.demoTitle"),
                    message:  <SDMTDemoMessage />,
                    infoOnly: true,
                    confirmText: t("buttons.gotIt", { ns: "common" })
                });
            }
        };
        showDemoDialog();
    }, [gameState, confirm, t]);

    // ── Derived values ────────────────────────────────────────────────
    const shouldShowKeypad =
        !keypadSetting.includes('never') &&
        !(keypadSetting.includes('during') && gameState !== 'playing');

    const instructionConfig = useMemo(() => {
        if (gameState === 'stats')   return { key: "sdmt.completedInstructions", ns: "tasks" };
        if (gameState === 'playing') return { key: "sdmt.instructionsActive",    ns: "tasks" };
        return                              { key: "sdmt.instructions",          ns: "tasks" };
    }, [gameState]);

    // ── Sub-renderers ─────────────────────────────────────────────────
    const renderReferenceKey = () => (
        <div className="sdmt-reference-key">
            {referenceMap.map((symbolId, index) => {
                const digit = index + 1;
                return (
                    <div key={`key-${digit}`} className="sdmt-key-item">
                        <img
                            src={`${import.meta.env.VITE_APP_BASE_PATH}assets/sdmt/sdmt${symbolId}.svg`}
                            alt={`Symbol ${symbolId}`}
                            className="sdmt-key-img"
                        />
                        <div className="sdmt-key-number">{digit}</div>
                    </div>
                );
            })}
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

    // ── Slot content ──────────────────────────────────────────────────
    const mainContent = (
        <>
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
                            <div className="sdmt-symbol-placeholder" />
                        )}
                    </div>
                )}
            </div>

            {gameState !== 'stats' && renderKeypad()}
        </>
    );

    const controlsContent = (
        <>
            {gameState === 'instructions' && (
                <button className="btn-start" onClick={startGame}>
                    {t("sdmt.start")}
                </button>
            )}

            {gameState === 'playing' && (
                <div className="sdmt-timer">
                    <span>{timeLeft}s</span>
                </div>
            )}

            {gameState === 'stats' && (
                <>
                    <button className="btn-reset" onClick={resetGame}>
                        {t("buttons.repeat", { ns: "common" })}
                    </button>
                    <NextTaskButton onClick={onComplete} />
                </>
            )}
        </>
    );

    // ── Render ────────────────────────────────────────────────────────
    return (
        <TaskLayout
            className="sdmt-container"
            title={t("sdmt.title")}
            tooltip={
                <InfoTooltip
                    title={t("sdmt.demoTitle")}
                    text={<SDMTDemoMessage />}
                />
            }
            showSpacer={gameState !== 'playing'}
            instructions={
                <Trans
                    t={t}
                    i18nKey={instructionConfig.key}
                    ns={instructionConfig.ns}
                    values={{ duration }}
                />
            }
            instructionsClassName={`sdmt-instructions${gameState === 'playing' ? ' no-title' : ''}`}
            mainClassName="sdmt-main-interface"
            controlsClassName="sdmt-bottom-controls"
            controls={controlsContent}
        >
            {mainContent}
        </TaskLayout>
    );
};

export default SDMTTask;
