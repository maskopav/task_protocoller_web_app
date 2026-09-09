// frontend/src/api/sessionData.js
import { apiFetch } from "./apiClient";

function buildParams({ projectId, protocolId, since, until } = {}) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (protocolId) params.set("protocolId", protocolId);
  if (since) params.set("since", since);
  if (until) params.set("until", until);
  return params;
}

// GET /session-data/sessions -- lists sessions matching the filters so the
// admin can review/select before downloading.
export async function fetchSessionsForExport(filters) {
  const params = buildParams(filters);
  const res = await apiFetch(`/session-data/sessions?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load sessions");
  }
  return res.json(); // { sessions, truncated, maxSessions }
}

// GET /session-data/download -- either explicit sessionIds, or the same
// filters as fetchSessionsForExport to download everything matching them.
// Goes through apiFetch (not a plain <a href>) so the admin JWT rides along
// as a Bearer header, then saves the response as a Blob.
export async function downloadSessionDataZip({ filters, sessionIds } = {}) {
  const params = buildParams(filters);
  if (sessionIds && sessionIds.length > 0) {
    params.set("sessionIds", sessionIds.join(","));
  }

  const res = await apiFetch(`/session-data/download?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to download session data");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "session_data_export.zip";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
