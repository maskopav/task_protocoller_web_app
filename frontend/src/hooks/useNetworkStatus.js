// src/hooks/useNetworkStatus.js
import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const getStatus = () => {
    if (!navigator.onLine) return 'offline';
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (['slow-2g', '2g'].includes(conn.effectiveType)) return 'weak';
      if (conn.saveData) return 'weak';
    }
    return 'online';
  };

  const [status, setStatus] = useState(getStatus);

  useEffect(() => {
    const update = () => setStatus(getStatus());
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    navigator.connection?.addEventListener('change', update);

    return () => {
      window.removeEventListener('online',  update);
      window.removeEventListener('offline', update);
      navigator.connection?.removeEventListener('change', update);
    };
  }, []);

  return status; // 'online' | 'weak' | 'offline'
}