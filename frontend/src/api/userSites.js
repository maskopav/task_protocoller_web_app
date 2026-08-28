// src/api/userSites.js
import { apiFetch } from "./apiClient";

  export async function fetchSiteAssignments() {
    const res = await apiFetch(`/user-sites/user-sites`);
    if (!res.ok) throw new Error("Failed to fetch assignments");
    return res.json();
  }


  export async function assignSiteToUser(user_id, site_id) {
    const res = await apiFetch(`/user-sites/assign-site`, {
      method: "POST",
      body: JSON.stringify({ user_id, site_id })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Assignment failed");
    return json;
  }

  export async function removeUserSiteAssignmentApi(id) {
    const res = await apiFetch(`/user-sites/remove-assignment/${id}`, {
      method: "DELETE"
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to remove assignment");
    return json;
  }
