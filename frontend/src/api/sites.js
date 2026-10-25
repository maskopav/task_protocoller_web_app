// src/api/sites.js — clinics ("sites").
import { apiJson } from "./apiClient";
import { setRunsAt, removeRunsAt } from "./projects";

export const fetchSites = (projectId) =>
  apiJson(`/sites${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`, { fallback: "sites_fetch_failed" });

// -> the clinic plus projects[] (with can_edit) and receives[] (studies, each
// with grouped protocols and languages[]).
export const fetchSiteById = (siteId) => apiJson(`/sites/${siteId}`, { fallback: "site_fetch_failed" });

// -> { success, site_id }
export const createSite = (payload) =>
  apiJson("/sites", { method: "POST", body: payload, fallback: "site_create_failed" });

// Partial update; access_token is honoured for a master only (that is "rotate").
export const updateSite = (siteId, payload) =>
  apiJson(`/sites/${siteId}`, { method: "PATCH", body: payload, fallback: "site_update_failed" });

// The clinic side of "runs at" uses the study endpoints.
export const assignProjectToSite = (siteId, projectId) => setRunsAt(projectId, siteId);
export const removeProjectFromSite = (siteId, projectId) => removeRunsAt(projectId, siteId);

// The number of protocols a clinic's computers receive (receives[] is grouped by study).
export const countReceivedProtocols = (site) =>
  (site?.receives || []).reduce((n, study) => n + (study.protocols?.length || 0), 0);
