// src/api/projects.js — studies ("projects"), their editors and where they run.
import { getMappings } from "./mappings";
import { apiJson } from "./apiClient";

// The server scopes this from the Bearer token. Rows carry can_edit, is_owner,
// site_count, protocol_count and unreviewed next to the summary-view columns.
export const fetchProjectsList = () => apiJson("/projects", { fallback: "projects_fetch_failed" });

export const fetchProject = (id) => apiJson(`/projects/${id}`, { fallback: "project_fetch_failed" });

// Stats for one project, taken from the scoped list.
export async function getProjectStats(projectId) {
  const all = await fetchProjectsList();
  return all.find((p) => p.project_id === Number(projectId)) || null;
}

// -> { success, id }
export const createProject = (payload) =>
  apiJson("/projects", { method: "POST", body: payload, fallback: "project_create_failed" });

// Partial update: omitted fields stay, "" clears a text field.
export const updateProject = (id, payload) =>
  apiJson(`/projects/${id}`, { method: "PATCH", body: payload, fallback: "project_update_failed" });

export const archiveProject = (id, archived) =>
  apiJson(`/projects/${id}/archive`, { method: "POST", body: { archived }, fallback: "project_archive_failed" });

// Co-editors.
export const fetchEditors = (id) => apiJson(`/projects/${id}/editors`, { fallback: "editors_fetch_failed" });
export const addEditor = (id, email) =>
  apiJson(`/projects/${id}/editors`, { method: "POST", body: { email }, fallback: "editor_add_failed" });
export const removeEditor = (id, userId) =>
  apiJson(`/projects/${id}/editors/${userId}`, { method: "DELETE", fallback: "editor_remove_failed" });

// "Runs at": the study on / off at a clinic (the clinic side uses the same calls).
export const setRunsAt = (projectId, siteId) =>
  apiJson(`/projects/${projectId}/sites/${siteId}`, { method: "PUT", fallback: "runs_at_failed" });
export const removeRunsAt = (projectId, siteId) =>
  apiJson(`/projects/${projectId}/sites/${siteId}`, { method: "DELETE", fallback: "runs_at_failed" });

export async function getProjectFieldwork(projectId) {
  const data = await getMappings(["v_session_summary"]);
  return (data.v_session_summary || []).filter((s) => s.project_id === Number(projectId));
}
