// src/api/participantProtocol.js
const API_BASE = import.meta.env.VITE_API_BASE;

export async function fetchParticipantProtocol(token) {
  const res = await fetch(`${API_BASE}/participant-protocols/${token}`);
  console.log(res);
  if (!res.ok) {
    // Try to parse the specific error message from the backend
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch participant protocol");
  }
  return res.json();
}

export async function fetchParticipantProtocolView(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  const url = `${API_BASE}/participant-protocols${query ? `?${query}` : ""}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to load participant-protocols view");
  }
  return res.json();
}

export async function fetchParticipantProtocolById(id) {
  const url = `${API_BASE}/participant-protocols/${id}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to load entry");
  }
  return res.json();
}

export async function activateParticipantProtocol(participantProtocolId) {
  const res = await fetch(`${API_BASE}/participant-protocols/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participant_protocol_id: participantProtocolId })
  });
  
  if (!res.ok) throw new Error("Activation failed");
  return res.json();
}

export async function deactivateParticipantProtocol(participantProtocolId) {
  const res = await fetch(`${API_BASE}/participant-protocols/deactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participant_protocol_id: participantProtocolId })
  });

  if (!res.ok) throw new Error("Deactivation failed");
  return res.json();
}

export async function assignProtocolToParticipant(data) {
  // data: { participant_id, protocol_id, project_id }
  console.log(data);
  const res = await fetch(`${API_BASE}/participant-protocols/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to assign protocol");
  }
  return res.json();
}

export async function sendProtocolEmailApi({ email, body, link, lang }) {
  const res = await fetch(`${API_BASE}/participant-protocols/send-manual-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, body, link, lang }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to send email");
  }
  return res.json();
}