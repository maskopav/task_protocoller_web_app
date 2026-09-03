// frontend/src/api/systemLogs.js
import { apiFetch } from "./apiClient";

// Reads backend/logs/system_log.txt via GET /logs/frontend (master-admin
// only -- see server.js). This is the only way to see that file without
// server shell access, which most admins don't have.
export async function fetchSystemLogs({ tail, search, since, until } = {}) {
  const params = new URLSearchParams();
  if (tail) params.set("tail", tail);
  if (search) params.set("search", search);
  if (since) params.set("since", since);
  if (until) params.set("until", until);

  const res = await apiFetch(`/logs/frontend?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch system logs");
  }
  return res.json(); // { entries: string[] }
}
