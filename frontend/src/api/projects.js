// src/api/projects.js
import { getMappings } from "./mappings";
import { apiFetch } from "./apiClient";

// Stats for one project, taken from the scoped projects list rather than the
// /mappings dump of v_project_summary_stats: the list is filtered per user and
// carries can_edit, which the dump does not.
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

// The server scopes this from the Bearer token; passing an identity from the
// client was both redundant and spoofable.
export async function fetchProjectsList() {
  const res = await apiFetch(`/projects/projects-list`);

  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
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

// Add to src/api/projects.js
export async function getProjectFieldwork(projectId) {
  try {
    const data = await getMappings(["v_session_summary"]);
    const allSessions = data.v_session_summary || [];

    // Filter client-side for the specific project
    return allSessions.filter(s => s.project_id === Number(projectId));
  } catch (err) {
    console.error("Failed to load fieldwork data:", err);
    throw err;
  }
}
