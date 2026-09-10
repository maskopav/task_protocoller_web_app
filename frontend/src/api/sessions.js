// src/api/sessions.js
import { fetchWithTimeout } from "./fetchWithTimeout";

const API_BASE = import.meta.env.VITE_API_BASE;

export async function initSession({token, taskOrder}) {
  if (!token) throw new Error("initSession: Missing token");
  if (!taskOrder) throw new Error("initSession: Missing taskOrder");

  // Collect basic client-side metadata
  const deviceMetadata = {
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    platform: navigator.platform,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  const res = await fetchWithTimeout(`${API_BASE}/sessions/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      token, 
      deviceMetadata,
      taskOrder
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to init session");
  }

  return res.json(); // Returns { success: true, sessionId: 123 }
}

export async function trackProgress(sessionId, eventData, markCompleted = false) {
  if (!sessionId) return; // specific safeguard

  // Construct the payload
  const payload = {
    sessionId,
    markCompleted
  };

  // Only add event if provided
  if (eventData) {
    payload.event = {
      timestamp: new Date().toISOString(),
      ...eventData
    };
  }

  // Fire and forget (don't await strict response to keep UI snappy)
  fetchWithTimeout(`${API_BASE}/sessions/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(err => console.warn("Failed to log progress:", err));
}

// Same endpoint as trackProgress, but actually awaited and failure-surfacing
// — trackProgress is deliberately fire-and-forget (see its comment above)
// and doesn't return its promise, so `await trackProgress(id, null, true)`
// does not guarantee the server has actually persisted completed_at by the
// time it resolves. Use this instead wherever a caller's next step depends
// on that write having landed (e.g. BookingStep, which needs
// sessions.completed_at set before booking-service's eligibility check will
// accept a request). updateProgress always responds 200 even on internal
// failure (by design, so fire-and-forget pings never surface as network
// errors) and signals failure via a `warning` field instead — check that,
// not just res.ok.
export async function markSessionCompleted(sessionId) {
  const res = await fetchWithTimeout(`${API_BASE}/sessions/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, markCompleted: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.warning) {
    throw new Error(data.error || "Failed to mark session completed");
  }
  return data;
}

export async function saveQuestionnaireAnswers(payload) {
  const res = await fetchWithTimeout(`${API_BASE}/sessions/questionnaire-response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save questionnaire");
  return res.json();
}


export async function updateSessionIdentifiers(sessionId, identifiers, token) {
  const res = await fetchWithTimeout(`${API_BASE}/sessions/${sessionId}/identifiers`, {
    method: "PUT",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}` 
    },
    body: JSON.stringify({ identifiers }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save identifiers");
  }

  return res.json();
}