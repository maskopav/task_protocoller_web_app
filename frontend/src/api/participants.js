/* frontend/src/api/participants.js */
import { apiFetch } from "./apiClient";

export async function getParticipants(projectId) {
    // If projectId is provided, filter by it. Otherwise, fetch all.
    const url = projectId
        ? `/participants?project_id=${projectId}`
        : `/participants`;

    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to load participants");
    return res.json();
}

export async function createParticipant(data) {
  const res = await apiFetch(`/participants/create`, {
    method: "POST",
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create participant");
  return json;
}

export async function updateParticipant(id, data) {
    const res = await apiFetch(`/participants/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update participant");
    return json;
  }

  export async function searchParticipant(externalId) {
    const url = `/participants/search?external_id=${encodeURIComponent(externalId)}`;

    const res = await apiFetch(url);
    if (res.status === 404) return null; // Not found
    if (!res.ok) throw new Error("Search failed");

    return res.json();
  }
