// src/api/participantProtocol.js
const API_BASE = import.meta.env.VITE_API_BASE;
import { apiFetch } from "./apiClient";
import { fetchWithTimeout } from "./fetchWithTimeout";

// -- Participant-facing: gated by the token itself, no admin auth --

export async function fetchParticipantProtocol(token) {
  const res = await fetchWithTimeout(`${API_BASE}/participant-protocols/${token}`);
  if (!res.ok) {
    // Try to parse the specific error message from the backend
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch participant protocol");
  }
  return res.json();
}

// -- Admin dashboard actions: require a logged-in admin --

export async function fetchParticipantProtocolView(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  const url = `/participant-protocols${query ? `?${query}` : ""}`;

  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error("Failed to load participant-protocols view");
  }
  return res.json();
}

export async function fetchParticipantProtocolById(id) {
  const url = `/participant-protocols/${id}`;

  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error("Failed to load entry");
  }
  return res.json();
}

export async function activateParticipantProtocol(participantProtocolId) {
  const res = await apiFetch(`/participant-protocols/activate`, {
    method: "POST",
    body: JSON.stringify({ participant_protocol_id: participantProtocolId })
  });

  if (!res.ok) throw new Error("Activation failed");
  return res.json();
}

export async function deactivateParticipantProtocol(participantProtocolId) {
  const res = await apiFetch(`/participant-protocols/deactivate`, {
    method: "POST",
    body: JSON.stringify({ participant_protocol_id: participantProtocolId })
  });

  if (!res.ok) throw new Error("Deactivation failed");
  return res.json();
}

export async function assignProtocolToParticipant(data) {
  // data: { participant_id, protocol_id, project_id }
  const res = await apiFetch(`/participant-protocols/assign`, {
    method: "POST",
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to assign protocol");
  }
  return res.json();
}

export async function importLinkSentDates(projectId, rows) {
  const res = await apiFetch(`/participant-protocols/import-link-sent`, {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, rows }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to import link-sent dates");
  }
  return res.json();
}

export async function sendProtocolEmailApi({ email, subject, body, link, lang }) {
  const res = await apiFetch(`/participant-protocols/send-manual-email`, {
    method: "POST",
    body: JSON.stringify({ email, subject, body, link, lang }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to send email");
  }
  return res.json();
}

// Swap participant protocol - different language version
export const swapParticipantProtocolLanguage = async (token, new_project_protocol_id) => {
  const response = await fetchWithTimeout(`${API_BASE}/participant-protocols/${token}/language`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_project_protocol_id }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to change language");
  }
  
  return response.json();
};