const API_BASE = import.meta.env.VITE_API_BASE;

// HashRouter puts credentials in the route (/participant/<token>,
// /admin/reset-password/<token>); logs must not collect them. Any long
// token-like path segment is replaced, and the query string is dropped.
const redactedUrl = () => {
  const { origin, pathname, hash } = window.location;
  const route = hash.split("?")[0].replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, "/:redacted");
  return `${origin}${pathname}${route}`;
};

/**
 * Sends a structured log message to the backend.
 * @param {string} level - 'INFO', 'WARN', 'ERROR', or 'FATAL'
 * @param {string} message - A short description of the event.
 * @param {any} details - Any object, array, or error string.
 */
const sendLog = async (level, message, details = null) => {
  try {
    // Standardize the payload with critical debugging context
    const logPayload = {
      level,
      message,
      userAgent: navigator.userAgent,
      url: redactedUrl(),
      timestamp: new Date().toISOString(),
      details: null
    };

    // Safely extract Error objects (which don't stringify well by default)
    if (details instanceof Error) {
      logPayload.details = {
        name: details.name,
        message: details.message,
        stack: details.stack
      };
    } else if (details) {
      logPayload.details = details;
    }

    await fetch(`${API_BASE}/logs/frontend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(logPayload),
    });
  } catch (error) {
    // Failsafe so the app doesn't crash if logging fails[cite: 2]
    console.error("Could not send log to server:", error);
  }
};

// Export explicit methods to enforce logical logging levels
export const logger = {
  info: (message, details) => sendLog('INFO', message, details),
  warn: (message, details) => sendLog('WARN', message, details),
  error: (message, error) => sendLog('ERROR', message, error),
  fatal: (message, error) => sendLog('FATAL', message, error),
};