// frontend/src/api/apiClient.js
export const API_BASE = import.meta.env.VITE_API_BASE;

// Fetch wrapper for admin-only endpoints: attaches the admin JWT (if present)
// as a Bearer token, and clears the stored session + bounces to /login on 401
// so an expired/invalid token doesn't strand the user on a silently-broken page.
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("adminToken");
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("adminUser");
    localStorage.removeItem("adminToken");
    if (!window.location.hash.startsWith("#/login")) {
      window.location.hash = "/login";
    }
  }

  return res;
}
