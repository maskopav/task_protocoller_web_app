// src/api/users.js
import { apiFetch } from "./apiClient";

export async function fetchAllAdmins() {
    const res = await apiFetch(`/users/users`);
    if (!res.ok) throw new Error("Failed to fetch admins");
    return res.json();
  }

  export async function toggleAdminActive(user_id, is_active) {
    const res = await apiFetch(`/users/toggle-status`, {
      method: "POST",
      body: JSON.stringify({ user_id, is_active })
    });
    return res.json();
  }

  export async function createAdminApi(payload) {
    const res = await apiFetch(`/users/create`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create admin");
    return json;
  }

  export async function updateUserApi(payload) {
    const res = await apiFetch(`/users/update`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update user");
    return json;
}
