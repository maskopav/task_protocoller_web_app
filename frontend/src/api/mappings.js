// src/api/mappings.js
import { apiFetch } from "./apiClient";

// /mappings is behind requireAuth (see backend/server.js), so this must carry
// the admin JWT. apiFetch also clears the session and bounces to #/login on 401.
export async function getMappings(tables = []) {
  const query = tables.length ? `?tables=${tables.join(",")}` : "";
  const res = await apiFetch(`/mappings${query}`);
  if (!res.ok) throw new Error(`Failed to load mappings (${res.status})`);
  return res.json();
}
