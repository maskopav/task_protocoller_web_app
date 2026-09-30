const API_BASE = import.meta.env.VITE_API_BASE;

// Fields attached to every log entry (sessionId, current task, ...). The
// participant interface lives at /participant/interface -- the URL carries no
// token or session -- so without this a log line can't be matched to the
// session or recording it came from. Set via setLogContext().
let logContext = {};

/**
 * Merges fields into the context sent with every subsequent log entry.
 * Pass `undefined` for a key to remove it.
 */
export function setLogContext(fields) {
  const next = { ...logContext, ...fields };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  logContext = next;
}

export function clearLogContext() {
  logContext = {};
}

// Error objects don't JSON.stringify (name/message/stack are non-enumerable).
const serializeDetails = (details) => {
  if (details instanceof Error) {
    return { name: details.name, message: details.message, stack: details.stack };
  }
  return details ?? null;
};

/**
 * Sends a structured log message to the backend.
 * @param {string} level - 'INFO', 'WARN', 'ERROR', or 'FATAL'
 * @param {string} message - A short description of the event.
 * @param {any} details - Any object, array, or error string.
 * @param {object} [extra] - Additional fields, merged next to an Error's
 *   name/message/stack (e.g. logger.error("Upload failed", err, { taskIndex })).
 */
const sendLog = async (level, message, details = null, extra = null) => {
  try {
    let serialized = serializeDetails(details);
    if (extra) {
      serialized = serialized && typeof serialized === 'object'
        ? { ...serialized, ...extra }
        : { ...(serialized != null && { value: serialized }), ...extra };
    }

    const logPayload = {
      level,
      message,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      context: Object.keys(logContext).length > 0 ? logContext : null,
      details: serialized,
    };

    await fetch(`${API_BASE}/logs/frontend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(logPayload),
    });
  } catch (error) {
    // Failsafe so the app doesn't crash if logging fails
    console.error("Could not send log to server:", error);
  }
};

// Export explicit methods to enforce logical logging levels
export const logger = {
  info: (message, details, extra) => sendLog('INFO', message, details, extra),
  warn: (message, details, extra) => sendLog('WARN', message, details, extra),
  error: (message, error, extra) => sendLog('ERROR', message, error, extra),
  fatal: (message, error, extra) => sendLog('FATAL', message, error, extra),
};
