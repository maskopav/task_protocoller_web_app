// src/api/sessions.js
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

  const res = await fetch(`${API_BASE}/sessions/init`, {
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
  fetch(`${API_BASE}/sessions/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(err => console.warn("Failed to log progress:", err));
}

export async function saveQuestionnaireAnswers(payload) {
  const res = await fetch(`${API_BASE}/sessions/questionnaire-response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save questionnaire");
  return res.json();
}