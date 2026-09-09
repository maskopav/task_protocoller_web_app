// utils/fetchWithTimeout.js
//
// fetch() has no built-in timeout, so on a stalled connection -- or a tab
// that got backgrounded/frozen mid-request, observed on Android/Firefox --
// it can hang forever instead of resolving or rejecting. That leaves any
// caller awaiting it stuck permanently (see MicCheck.jsx, audioAnalysis.js
// and ParticipantInterfacePage.jsx, which all re-read a recording via
// fetch() on its own blob: object URL). Bound every such fetch so callers
// always get a predictable failure to handle instead of an unresponsive UI.
export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
