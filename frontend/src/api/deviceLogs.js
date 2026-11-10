// src/api/deviceLogs.js — device logs sent by the desktop app (docs/device_logs/01_spec.md §5).
// Master only. View and download open in the browser, which cannot send the
// Authorization header, so they use a short-lived download ticket in the URL.
import { apiJson, API_BASE } from "./apiClient";
import { getDownloadTicket } from "./uploads";

/** @returns {Promise<{logs: Array<object>}>} newest first */
export const fetchDeviceLogs = (siteId) =>
  apiJson(`/devices/logs?siteId=${encodeURIComponent(siteId)}`, { fallback: "Failed to load logs" });

const logUrl = (id, kind, ticket) =>
  `${API_BASE}/devices/logs/${encodeURIComponent(id)}/${kind}?ticket=${encodeURIComponent(ticket)}`;

/** Opens the decompressed text in a new tab. */
export async function viewDeviceLog(id) {
  // Opened before the ticket request: a window opened after an await is taken for a popup.
  const tab = window.open("about:blank", "_blank");
  try {
    const ticket = await getDownloadTicket();
    if (tab) {
      tab.opener = null;
      tab.location.href = logUrl(id, "view", ticket);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Starts a native download of the stored .gz. */
export async function downloadDeviceLog(id) {
  const ticket = await getDownloadTicket();
  const a = document.createElement("a");
  a.href = logUrl(id, "download", ticket);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
