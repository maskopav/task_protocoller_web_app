// src/api/userProjects.js
import { apiFetch } from "./apiClient";

  export async function fetchAdminAssignments() {
    const res = await apiFetch(`/user-projects/user-projects`);
    if (!res.ok) throw new Error("Failed to fetch assignments");
    return res.json();
  }


  export async function assignProjectToUser(user_id, project_id, can_edit = true) {
    const res = await apiFetch(`/user-projects/assign-project`, {
      method: "POST",
      body: JSON.stringify({ user_id, project_id, can_edit })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Assignment failed");
    return json;
  }

  // Hand over or take back authorship without removing the assignment.
  export async function setAssignmentCanEdit(assignment_id, can_edit) {
    const res = await apiFetch(`/user-projects/${assignment_id}/can-edit`, {
      method: "PUT",
      body: JSON.stringify({ can_edit })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update assignment");
    return json;
  }

  export async function removeUserProjectAssignmentApi(id) {
    const res = await apiFetch(`/user-projects/remove-assignment/${id}`, {
      method: "DELETE"
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to remove assignment");
    return json;
  }

  // Which of a project's clinics one user sees through it.
  export async function fetchProjectSiteAccess(userId, projectId) {
    const res = await apiFetch(`/user-projects/${userId}/${projectId}/sites`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to fetch clinic access");
    return json;
  }

  // site_ids: null clears the whitelist (all clinics, including future ones);
  // an array stores exactly those. An empty array is refused by the server.
  export async function setProjectSiteAccess(userId, projectId, site_ids) {
    const res = await apiFetch(`/user-projects/${userId}/${projectId}/sites`, {
      method: "PUT",
      body: JSON.stringify({ site_ids })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update clinic access");
    return json;
  }
