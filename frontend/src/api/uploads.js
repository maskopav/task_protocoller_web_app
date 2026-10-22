// frontend/src/api/uploads.js
// Client for the phase B upload management API (docs/upload_management/
// specification.md §8–9 and its "API responses" appendix). Shared by the
// uploads, session, devices and downloads pages.
import { apiFetch, API_BASE } from "./apiClient";

async function json(res, fallback) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || fallback);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Arrays become repeated params (site=1&site=2), empty values are dropped.
export function toQuery(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const fetchUploads = async (params) => json(await apiFetch(`/uploads${toQuery(params)}`), "Failed to load uploads");
export const fetchUploadSummary = async (params) => json(await apiFetch(`/uploads/summary${toQuery(params)}`), "Failed to load upload summary");
// ctx: the list's query string, so prev/next follow the same filters.
export const fetchSession = async (sessionId, ctx = "") =>
  json(await apiFetch(`/uploads/${sessionId}${ctx ? `?ctx=${encodeURIComponent(ctx)}` : ""}`), "Failed to load session");
export const fetchAttempts = async (sessionId) => json(await apiFetch(`/uploads/${sessionId}/attempts`), "Failed to load upload history");
export const revealParticipant = async (sessionId) =>
  json(await apiFetch(`/uploads/${sessionId}/reveal`, { method: "POST" }), "Failed to reveal participant");
export const updateParticipant = async (sessionId, fields) =>
  json(await apiFetch(`/uploads/${sessionId}/participant`, { method: "PATCH", body: JSON.stringify({ fields }) }), "Failed to update participant");
export const setReview = async (sessionId, qc) =>
  json(await apiFetch(`/uploads/${sessionId}/qc`, { method: "PUT", body: JSON.stringify({ qc }) }), "Failed to set review");
export const fetchComments = async (sessionId) => json(await apiFetch(`/uploads/${sessionId}/comments`), "Failed to load comments");
export const postComment = async (sessionId, text) =>
  json(await apiFetch(`/uploads/${sessionId}/comments`, { method: "POST", body: JSON.stringify({ text }) }), "Failed to post comment");

export const fetchDevices = async (params) => json(await apiFetch(`/devices${toQuery(params)}`), "Failed to load devices");
export const renameDevice = async (id, label) =>
  json(await apiFetch(`/devices/${id}`, { method: "PUT", body: JSON.stringify({ label }) }), "Failed to rename device");
export const assignDeviceSite = async (id, siteId) =>
  json(await apiFetch(`/devices/${id}/site`, { method: "PUT", body: JSON.stringify({ siteId }) }), "Failed to assign device");

// --- Downloads ----------------------------------------------------------------
// <audio>/<video> and native downloads cannot send the Authorization header, so
// they authenticate with a short-lived download ticket (5 min, download routes
// only). Native downloads stream straight to disk; nothing is held in memory.

export async function getDownloadTicket() {
  return (await json(await apiFetch(`/uploads/ticket`, { method: "POST" }), "Failed to authorize download")).ticket;
}

/** URL for a clip, playable by <audio>/<video> (supports seeking via Range). */
export const clipUrl = (sessionId, clipFile, ticket) =>
  `${API_BASE}/uploads/${sessionId}/clips/${clipFile.replace(/^clips\//, "").split("/").map(encodeURIComponent).join("/")}?ticket=${encodeURIComponent(ticket)}`;

/** Starts a native download of one session's ZIP. */
export async function downloadSessionZip(sessionId) {
  const ticket = await getDownloadTicket();
  const a = document.createElement("a");
  a.href = `${API_BASE}/uploads/${sessionId}/zip?ticket=${encodeURIComponent(ticket)}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Starts a native download of a bundle. It's a plain form POST, so the browser
 * streams a multi-GB archive to disk. The server checks permissions and
 * limits. On refusal the browser shows the JSON error, so the page should
 * validate the selection first (≤ 200 sessions, ≤ 5 GB, nothing validating).
 */
export async function downloadBundle(sessionIds) {
  const ticket = await getDownloadTicket();
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_BASE}/uploads/download`;
  form.style.display = "none";
  for (const [name, value] of [["ticket", ticket], ["sessionIds", sessionIds.join(",")]]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** CSV export of the current list filters (authenticated fetch, CSV is small). */
export async function downloadUploadsCsv(params) {
  const res = await apiFetch(`/uploads/export.csv${toQuery(params)}`);
  if (!res.ok) throw new Error("Failed to export CSV");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "uploads.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
