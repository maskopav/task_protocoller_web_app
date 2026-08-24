// src/api/userProjects.js
import { apiFetch } from "./apiClient";

  export async function fetchAdminAssignments() {
    const res = await apiFetch(`/user-projects/user-projects`);
    if (!res.ok) throw new Error("Failed to fetch assignments");
    return res.json();
  }


  export async function assignProjectToUser(user_id, project_id) {
    const res = await apiFetch(`/user-projects/assign-project`, {
      method: "POST",
      body: JSON.stringify({ user_id, project_id })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Assignment failed");
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
