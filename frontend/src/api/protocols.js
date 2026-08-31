// frontend/src/api/protocols.js
import { apiFetch } from "./apiClient";

export async function saveProtocolToBackend(protocolData) {
    try {
      const response = await apiFetch(`/protocols/save`, {
        method: "POST",
        body: JSON.stringify(protocolData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save protocol");

      return data;
    } catch (error) {
      console.error("Error in saveProtocol:", error);
      throw error;
    }
  }

export async function getProtocolById(protocolId) {
  const res = await apiFetch(`/protocols/${protocolId}`);
  if (!res.ok) throw new Error("Failed to fetch protocol");
  return res.json(); // expected: { protocolData, tasks }
}

export async function getProtocolsByProjectId(projectId) {
  // If projectId is provided, filter by it. Otherwise, fetch all.
  const url = projectId
    ? `/protocols?project_id=${projectId}`
    : `/protocols`;

  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Failed to fetch protocols");
  return res.json();
}

export async function getArchivedProtocols() {
  const res = await apiFetch(`/protocols/archived`);
  if (!res.ok) throw new Error("Failed to fetch archived protocols");
  return res.json();
}

export async function archiveProtocol(protocolId) {
  const res = await apiFetch(`/protocols/${protocolId}/archive`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to archive protocol");
  return res.json();
}
