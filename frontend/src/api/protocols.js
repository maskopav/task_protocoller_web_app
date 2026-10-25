// src/api/protocols.js
import { apiJson } from "./apiClient";

// Creates a protocol, or saves a new version of one (editingMode).
// -> { success, protocol_id }
export const saveProtocol = (protocolData) =>
  apiJson("/protocols", { method: "POST", body: protocolData, fallback: "protocol_save_failed" });

// -> the assembled protocol plus can_edit
export const getProtocolById = (protocolId) =>
  apiJson(`/protocols/${protocolId}`, { fallback: "protocol_load_failed" });

// One item per protocol group, with languages[] ({language_id, code, protocol_id}).
// archived: true lists the archived ones instead of the current ones.
export const getProtocolsByProjectId = (projectId, { archived = false } = {}) =>
  apiJson(`/projects/${projectId}/protocols?archived=${archived ? 1 : 0}`, { fallback: "protocols_load_failed" });

export const archiveProtocol = (protocolId) =>
  apiJson(`/protocols/${protocolId}/archive`, { method: "POST", fallback: "protocol_archive_failed" });

// Copies a study protocol's group into the library (or adds a new library version).
export const shareProtocol = (protocolId) =>
  apiJson(`/protocols/${protocolId}/share`, { method: "POST", fallback: "protocol_share_failed" });
