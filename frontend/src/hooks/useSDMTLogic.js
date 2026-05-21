import { useState, useEffect, useCallback, useRef } from 'react';

const SYMBOLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SYMBOL_DELAY = 200; // 200ms delay before showing next symbol

export const useSDMTLogic = (duration = 90, onComplete) => {
    const [gameState, setGameState] = useState('instructions'); // 'instructions', 'playing', 'stats'
    const [timeLeft, setTimeLeft] = useState(duration);
    const [currentSymbol, setCurrentSymbol] = useState(null);
    const [isSymbolVisible, setIsSymbolVisible] = useState(false);
    
    // Using refs for data we need immediately without waiting for re-renders
    const tapDataRef = useRef([]);
    const appearTimestampRef = useRef(0);

    // Changes the symbol with a delay
    const changeSymbol = useCallback(() => {
        setIsSymbolVisible(false);
        
        setTimeout(() => {
            const randomSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            setCurrentSymbol(randomSymbol);
            setIsSymbolVisible(true);
            appearTimestampRef.current = Date.now();
        }, SYMBOL_DELAY);
    }, []);

    // Handles the start button
    const startGame = () => {
        setGameState('playing');
        setTimeLeft(duration);
        tapDataRef.current = [];
        changeSymbol();
    };

    const handleTap = useCallback((tappedNumber) => {
        if (!isSymbolVisible || gameState !== 'playing') return;

        const isCorrect = tappedNumber === currentSymbol;
        
        tapDataRef.current.push({
            appearTimestamp: appearTimestampRef.current,
            tapTimestamp: Date.now(),
            isCorrectTap: isCorrect,
            currentSymbolNumber: currentSymbol,
            tapSymbolNumber: tappedNumber
        });

        changeSymbol();
    }, [isSymbolVisible, gameState, currentSymbol, changeSymbol]);

    const stopGame = () => {
        setGameState('stats');
        setIsSymbolVisible(false);
    };

    const resetGame = () => {
        setGameState('instructions');
        setTimeLeft(duration);
        setCurrentSymbol(null);
        setIsSymbolVisible(false);
        tapDataRef.current = [];
    };

    // Timer Logic
    useEffect(() => {
        let timer;
        if (gameState === 'playing' && timeLeft > 0) {
            timer = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && gameState === 'playing') {
            // Timer finished
            setGameState('stats');
            setIsSymbolVisible(false);
            
            // Calculate correct percentage
            const data = tapDataRef.current;
            const correctTaps = data.filter(tap => tap.isCorrectTap).length;
            const correctPercentage = data.length > 0 ? Math.round((correctTaps / data.length) * 100) : 0;
            
            // Trigger the completion callback with the structured JSON
            if (onComplete) {
                onComplete({
                    correctPercentage,
                    totalTaps: data.length,
                    correctTaps,
                    events: data
                });
            }
        }
        return () => clearInterval(timer);
    }, [gameState, timeLeft, onComplete]);

    // Keyboard support for 1-9 keys (Better accessibility for web)
    useEffect(() => {
        const handleKeyDown = (e) => {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                handleTap(num);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleTap]);

    return {
        gameState,
        timeLeft,
        currentSymbol,
        isSymbolVisible,
        startGame,
        handleTap,
        stopGame,
        resetGame
    };
};