import { useState, useEffect, useCallback, useRef } from 'react';

const BASE_SYMBOLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SYMBOL_DELAY = 200; // 200ms delay before showing next symbol

// Helper: True deterministic cross-platform PRNG (Linear Congruential Generator)
const getSeededRandom = (seed) => {
    // We use standard LCG constants to guarantee identical results on any device
    let state = seed || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0; // Bitwise unsigned right shift
        return state / 4294967296; // Normalize to a 0-1 float
    };
};

// Helper: Fisher-Yates Shuffle
const shuffleArray = (array, randomFunc = Math.random) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(randomFunc() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// Helper: Generate the map based on the selected ordering rule
const generateMap = (ordering, repeatIndex, attemptCount) => {
    if (ordering === 'static') {
        return [...BASE_SYMBOLS];
    } else if (ordering === 'fixed_by_run') {
        const safeRepeat = parseInt(repeatIndex, 10) || 1;
        const safeAttempt = parseInt(attemptCount, 10) || 1;
        
        const seed = (safeRepeat * 10) + safeAttempt; 

        const seededRandom = getSeededRandom(seed);
        const newMap = shuffleArray(BASE_SYMBOLS, seededRandom);
        return newMap;
    } else {
        return shuffleArray(BASE_SYMBOLS, Math.random); 
    }
};

export const useSDMTLogic = (duration = 90, symbolOrdering = 'fixed_by_run', repeatIndex = 1) => {
    const [gameState, setGameState] = useState('instructions'); // 'instructions', 'playing', 'stats'
    const [timeLeft, setTimeLeft] = useState(duration);
    const [currentSymbol, setCurrentSymbol] = useState(null);
    const [isSymbolVisible, setIsSymbolVisible] = useState(false);
    const [results, setResults] = useState(null);
    const [attemptCount, setAttemptCount] = useState(1);

    // State to hold our symbol-to-digit mapping
    const [referenceMap, setReferenceMap] = useState(() => generateMap(symbolOrdering, repeatIndex, attemptCount));

    // Update map if props change (e.g., component remounts with a new run index)
    useEffect(() => {
        setReferenceMap(generateMap(symbolOrdering, repeatIndex, attemptCount));
    }, [symbolOrdering, repeatIndex, attemptCount]);
    
    // Using refs for data we need immediately without waiting for re-renders
    const tapDataRef = useRef([]);
    const appearTimestampRef = useRef(0);

    // Changes the symbol with a delay
    const changeSymbol = useCallback(() => {
        setIsSymbolVisible(false);
        
        setTimeout(() => {
            const randomSymbol = BASE_SYMBOLS[Math.floor(Math.random() * BASE_SYMBOLS.length)];
            setCurrentSymbol(randomSymbol);
            setIsSymbolVisible(true);
            appearTimestampRef.current = Date.now();
        }, SYMBOL_DELAY);
    }, []);

    // Handles the start button
    const startGame = () => {
        // If ordering is purely random, reshuffle the key every single time they hit "Start"
        if (symbolOrdering === 'random') {
            setReferenceMap(generateMap('random', repeatIndex, attemptCount));
        }
        setGameState('playing');
        setTimeLeft(duration);
        tapDataRef.current = [];
        setResults(null);
        changeSymbol();
    };

    const handleTap = useCallback((tappedNumber) => {
        if (!isSymbolVisible || gameState !== 'playing') return;

        const mappedSymbol = referenceMap[tappedNumber - 1];
        const isCorrect = mappedSymbol === currentSymbol;
        
        tapDataRef.current.push({
            appearTimestamp: appearTimestampRef.current,
            tapTimestamp: Date.now(),
            isCorrectTap: isCorrect,
            currentSymbolNumber: currentSymbol, // The symbol displayed on screen
            tapSymbolNumber: tappedNumber,      // The digit they pressed
            mappedSymbolNumber: mappedSymbol    // The symbol mapped to the digit they pressed
        });

        changeSymbol();
    }, [isSymbolVisible, gameState, currentSymbol, changeSymbol, referenceMap]);

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
        setResults(null);
        setAttemptCount(prev => prev + 1); // Increment attempt count to change the map for the next run if using "fixed_by_run"
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
            setResults({
                correctPercentage,
                totalTaps: data.length,
                correctTaps,
                events: data,
                referenceMap
            });
        }
        return () => clearInterval(timer);
    }, [gameState, timeLeft, referenceMap]);

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
        referenceMap,
        results,
        startGame,
        handleTap,
        stopGame,
        resetGame
    };
};