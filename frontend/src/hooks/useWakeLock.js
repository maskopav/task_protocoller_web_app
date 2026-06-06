import { useEffect, useRef, useCallback } from 'react';

export const useWakeLock = () => {
  const wakeLockRef = useRef(null);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock is active!');

        wakeLockRef.current.addEventListener('release', () => {
          console.log('Screen Wake Lock was released');
        });
      } catch (err) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
      }
    } else {
      console.warn('Wake Lock API not supported in this browser.');
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current !== null) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('Screen Wake Lock manually released');
    }
  }, []);

  // Important: The browser automatically releases the lock if the user switches tabs.
  // This effect re-acquires the lock when they come back to the web app.
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clean up the lock when the component unmounts (e.g., when the task ends)
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
};