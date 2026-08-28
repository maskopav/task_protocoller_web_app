// frontend/src/api/sites.js
import { apiFetch } from "./apiClient";

export async function fetchSites(projectId) {
  const query = projectId ? `?project_id=${projectId}` : "";
  const res = await apiFetch(`/sites${query}`);
  if (!res.ok) throw new Error("Failed to fetch sites");
  return res.json();
}

// Sites assigned to the logged-in admin (master sees all)
export async function fetchSitesList(userId, role) {
  const params = new URLSearchParams();
  if (userId) params.append("userId", userId);
  if (role) params.append("role", role);
  const res = await apiFetch(`/sites?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch sites");
  return res.json();
}

export async function fetchSiteById(siteId) {
  const res = await apiFetch(`/sites/${siteId}`);
  if (!res.ok) throw new Error("Failed to fetch site");
  return res.json();
}

export async function createSite(payload) {
  const res = await apiFetch(`/sites/create`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create site");
  return json;
}

export async function updateSite(siteId, payload) {
  const res = await apiFetch(`/sites/${siteId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update site");
  return json;
}

export async function assignProjectToSite(siteId, projectId) {
  const res = await apiFetch(`/sites/${siteId}/projects`, {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to assign project");
  return json;
}

export async function removeProjectFromSite(siteId, projectId) {
  const res = await apiFetch(`/sites/${siteId}/projects/${projectId}`, {
    method: "DELETE",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to remove assignment");
  return json;
}