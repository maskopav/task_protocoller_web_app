// src/api/fetchWithTimeout.js
//
// Plain fetch() has no built-in timeout, so a stalled (not failed) connection
// leaves an `await fetch(...)` pending forever -- see recordings.js for the
// original version of this used for uploads. This is the same pattern for
// the small JSON participant-facing endpoints (protocol load, session init,
// identifiers, language swap, task-result save): a flat timeout is enough
// since these payloads are tiny, unlike a multi-MB recording upload.
const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
