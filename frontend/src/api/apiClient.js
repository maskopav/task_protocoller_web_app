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

// Error thrown by the resource modules: `code` is the backend's snake_case
// error code (e.g. "name_taken"), `status` the HTTP status. `message` equals
// the code so a bare err.message is still readable; screens translate it with
// utils/apiError.js.
export class ApiError extends Error {
  constructor(status, code, body = {}) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// Parses a JSON response, throwing ApiError on a non-2xx status.
export async function readJson(res, fallbackCode = "request_failed") {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error || fallbackCode, body);
  return body;
}

// apiFetch + readJson for the common case of a JSON body.
export async function apiJson(path, { method = "GET", body, fallback } = {}) {
  const options = { method };
  if (body !== undefined) options.body = JSON.stringify(body);
  return readJson(await apiFetch(path, options), fallback);
}
