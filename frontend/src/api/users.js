// src/api/users.js — user management (master only).
import { apiJson } from "./apiClient";

// -> [{ id, name, email, role, is_active, can_create_projects, can_create_sites, sites:[{id,name}] }]
export const fetchAllAdmins = () => apiJson("/users", { fallback: "users_fetch_failed" });
export const fetchUser = (id) => apiJson(`/users/${id}`, { fallback: "user_fetch_failed" });

// -> { success, id }
export const createAdminApi = (payload) =>
  apiJson("/users", { method: "POST", body: payload, fallback: "user_create_failed" });

// Partial: name, email, is_active, can_create_projects, can_create_sites.
export const updateUser = (id, payload) =>
  apiJson(`/users/${id}`, { method: "PATCH", body: payload, fallback: "user_update_failed" });

export const toggleAdminActive = (id, isActive) => updateUser(id, { is_active: !!isActive });

// Replaces the user's clinic set.
export const setUserSites = (id, siteIds) =>
  apiJson(`/users/${id}/sites`, { method: "PUT", body: { site_ids: siteIds }, fallback: "user_sites_failed" });
