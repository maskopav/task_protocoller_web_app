import { useEffect, useRef, useCallback } from 'react';
import keepAwakeVideoUrl from '../assets/media/keepAwake.mp4';

// iPadOS 13+ reports itself as "MacIntel", so fall back to touch support.
const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const hasNativeWakeLock = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

// Events after which we re-check the lock. Interaction events matter on iOS:
// the video fallback may only start from a user gesture, and a lock the system
// dropped (call, notification, low power mode) gets restored on the next tap.
const INTERACTION_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

/**
 * Keeps the screen awake while requested.
 *
 * Uses the Screen Wake Lock API where available. On iOS it also plays a tiny
 * muted, looping, inline video (the NoSleep technique), because the native
 * API is missing in older iOS versions and in in-app browsers (WKWebView) and
 * is known to stop working silently. The same video is used on other
 * platforms when the native lock is unsupported or refused.
 */
export const useWakeLock = () => {
  const wantedRef = useRef(false);
  const sentinelRef = useRef(null);
  const pendingRef = useRef(null);
  const videoRef = useRef(null);

  const startVideo = useCallback(() => {
    if (typeof document === 'undefined' || !document.body) return;
    let video = videoRef.current;
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('x-webkit-airplay', 'deny');
      video.muted = true;
      video.loop = true;
      video.disableRemotePlayback = true;
      video.src = keepAwakeVideoUrl;
      Object.assign(video.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
      document.body.appendChild(video);
      videoRef.current = video;
    }
    if (!video.paused) return;
    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        // Expected before the first user gesture; the next tap retries.
        playPromise.catch(() => {});
      }
    } catch {
      // Media playback unavailable (e.g. jsdom) — nothing else to do.
    }
  }, []);

  const acquireNative = useCallback(async () => {
    if (!hasNativeWakeLock()) return false;
    if (sentinelRef.current && !sentinelRef.current.released) return true;
    // Requests made while hidden are rejected; visibilitychange retries later.
    if (document.visibilityState !== 'visible') return false;

    if (!pendingRef.current) {
      pendingRef.current = navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (!wantedRef.current) {
            sentinel.release().catch(() => {});
            return false;
          }
          sentinelRef.current = sentinel;
          sentinel.addEventListener('release', () => {
            if (sentinelRef.current === sentinel) sentinelRef.current = null;
          });
          return true;
        })
        .catch((err) => {
          console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
          return false;
        })
        .finally(() => {
          pendingRef.current = null;
        });
    }
    return pendingRef.current;
  }, []);

  const ensureAwake = useCallback(async () => {
    if (!wantedRef.current) return;
    // Start the video synchronously so it stays inside the user-gesture window.
    if (isIOS() || !hasNativeWakeLock()) startVideo();
    const nativeHeld = await acquireNative();
    if (wantedRef.current && !nativeHeld) startVideo();
  }, [acquireNative, startVideo]);

  const requestWakeLock = useCallback(async () => {
    wantedRef.current = true;
    await ensureAwake();
  }, [ensureAwake]);

  const releaseWakeLock = useCallback(async () => {
    wantedRef.current = false;
    if (videoRef.current) videoRef.current.pause();
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // Already released by the browser.
      }
    }
  }, []);

  // The browser drops the lock (and iOS pauses the video) when the page is
  // hidden, so re-acquire whenever the page is visible again or the
  // participant interacts with it.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') ensureAwake();
    };
    const handleInteraction = () => ensureAwake();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleInteraction);
    window.addEventListener('focus', handleInteraction);
    INTERACTION_EVENTS.forEach((type) =>
      document.addEventListener(type, handleInteraction, { capture: true, passive: true })
    );

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleInteraction);
      window.removeEventListener('focus', handleInteraction);
      INTERACTION_EVENTS.forEach((type) =>
        document.removeEventListener(type, handleInteraction, { capture: true })
      );
      // Clean up the lock when the component unmounts (e.g., when the task ends)
      releaseWakeLock();
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, [ensureAwake, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
};
