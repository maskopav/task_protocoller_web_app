// src/api/projects.js
import { apiFetch } from "./apiClient";

// Project scoping (master sees all, other admins see only assigned
// projects) is resolved server-side from the caller's own JWT — see
// projectController.getProjectList — so this never needs to be told who's
// asking.
export async function fetchProjectsList() {
  const res = await apiFetch(`/projects/projects-list`);

  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

// Fetch stats for a specific project — reuses the same access-scoped list
// endpoint as fetchProjectsList and just picks out the one project, rather
// than duplicating the master/assigned-project authorization logic here.
export async function getProjectStats(projectId) {
  try {
    const allStats = await fetchProjectsList();
    const projectStats = allStats.find(p => p.project_id === Number(projectId));
    return projectStats || null;
  } catch (err) {
    console.error("Failed to load project stats:", err);
    throw err;
  }
}

export async function createProjectApi(payload) {
  const res = await apiFetch(`/projects/create`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create project");
  return json;
}

export async function updateProjectApi(payload) {
  const res = await apiFetch(`/projects/update`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update project");
  return json;
}

export async function getProjectFieldwork(projectId) {
  const res = await apiFetch(`/projects/${projectId}/fieldwork`);
  if (!res.ok) throw new Error("Failed to fetch fieldwork data");
  return res.json();
}
