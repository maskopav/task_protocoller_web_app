const API_BASE = import.meta.env.VITE_API_BASE;

/**
 * Sends a log message to the backend to be saved in frontend_log.txt
 * @param {string} message - A short description of the event.
 * @param {any} details - Any object, array, or error string (e.g., debugData).
 */
export const logToServer = async (message, details = null) => {
  try {
    await fetch(`${API_BASE}/logs/frontend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, details }),
    });
  } catch (error) {
    // Failsafe so the app doesn't crash if logging fails
    console.error("Could not send log to server:", error);
  }
};