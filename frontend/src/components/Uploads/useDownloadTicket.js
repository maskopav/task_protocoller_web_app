import { useCallback, useEffect, useRef } from "react";
import { getDownloadTicket } from "../../api/uploads";

const REFRESH_MS = 4 * 60 * 1000; // tickets live 5 minutes

/**
 * Keeps a fresh download ticket for <audio>/<video> elements (they cannot send the
 * Authorization header). `enabled` is false while the viewer has no edit rights, since
 * the clip endpoints need them. Returns { getTicket, refresh }; both are stable and
 * read the latest ticket from a ref, so a refresh never re-renders playing media.
 */
export default function useDownloadTicket(enabled = true) {
  const ref = useRef(null);
  const inflight = useRef(null);

  const refresh = useCallback(() => {
    inflight.current = getDownloadTicket()
      .then((tk) => (ref.current = tk))
      .catch(() => null)
      .finally(() => (inflight.current = null));
    return inflight.current;
  }, []);

  // Resolves with a usable ticket, fetching one if none has arrived yet.
  const getTicket = useCallback(async () => ref.current || inflight.current || refresh(), [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { getTicket, refresh };
}
