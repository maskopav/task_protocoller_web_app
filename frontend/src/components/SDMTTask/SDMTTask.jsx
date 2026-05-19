import React from 'react';
import { useSDMTLogic } from '../../hooks/useSDMTLogic';

// Import the Recorder styles so we can reuse its native layout classes
import '../Recorder/Recorder.css'; 
import './SDMTTask.css'; 

const SDMTTask = ({ taskParams, onComplete }) => {
    
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
                    <img src={`/assets/sdmt/sdmt${num}.svg`} alt={`Symbol ${num}`} className="sdmt-key-img"/>
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
            
            <div className="task-header sdmt-header-wrapper">
                <h1>Symbol Digit Modalities Test</h1>
                {gameState === 'playing' && <div className="sdmt-timer">Time Left: <span>{timeLeft}s</span></div>}
            </div>

            {/* BOARD */}
            {gameState !== 'stats' && (
                <div className="sdmt-board">
                    {renderReferenceKey()}
                    
                    <div className="sdmt-active-symbol-container">
                        {gameState === 'playing' && isSymbolVisible && currentSymbol ? (
                            <img 
                                src={`/assets/sdmt/sdmt${currentSymbol}.svg`} 
                                alt="Current Symbol" 
                                className="sdmt-active-symbol fade-scale-in"
                            />
                        ) : (
                            <div className="sdmt-symbol-placeholder"></div>
                        )}
                    </div>
                </div>
            )}

            {/* INSTRUCTIONS */}
            {gameState === 'instructions' && (
                <div className="sdmt-instructions">
                    <p>Look at the reference key at the top.</p>
                    <p>Match the large symbol shown in the center with its corresponding number.</p>
                    <p>You have <strong>{duration} seconds</strong>. Work as quickly and accurately as possible.</p>
                    <button className="btn-primary sdmt-start-btn" onClick={startGame}>START</button>
                </div>
            )}

            {/* KEYPAD */}
            {gameState !== 'stats' && renderKeypad()}

            {/* STATS SCREEN */}
            {gameState === 'stats' && (
                <div className="sdmt-stats">
                    <div className="task-header">
                        <h1>Task Complete!</h1>
                    </div>
                    <p>Your results have been saved securely.</p>
                </div>
            )}
        </div>
    );
};

export default SDMTTask;