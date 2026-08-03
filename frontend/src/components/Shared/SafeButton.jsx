import React, { useState, useRef, useCallback } from 'react';

export const SafeButton = ({
  onClick,
  debounceMs = 500,
  children,
  disabled,
  className,
  loadingText = 'Processing...',
  ...props
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const lastClickRef = useRef(0);
  const isProcessingRef = useRef(false);

  const handleClick = useCallback(async (e) => {
    const now = Date.now();
    if (now - lastClickRef.current < debounceMs) return;
    if (isProcessingRef.current || disabled) return;

    lastClickRef.current = now;
    isProcessingRef.current = true;
    setIsLoading(true);

    try {
      await onClick?.(e);
    } finally {
      isProcessingRef.current = false;
      setIsLoading(false);
    }
  }, [onClick, debounceMs, disabled]);

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={className}
      aria-busy={isLoading}
    >
      {isLoading ? loadingText : children}
    </button>
  );
};