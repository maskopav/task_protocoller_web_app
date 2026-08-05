import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Guards against a "ghost tap" landing on a control that just appeared/became
 * enabled where a different control used to be (e.g. Stop -> Next/Repeat,
 * a keypad disappearing into stats buttons, a Next button flipping enabled
 * the instant the last item is placed). Call `trigger()` at the moment the
 * swap happens; `isCoolingDown` stays true for `delayMs` afterwards.
 */
export function useActionCooldown(delayMs = 500) {
    const [isCoolingDown, setIsCoolingDown] = useState(false);
    const timeoutRef = useRef(null);

    const trigger = useCallback(() => {
        setIsCoolingDown(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setIsCoolingDown(false), delayMs);
    }, [delayMs]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return [isCoolingDown, trigger];
}