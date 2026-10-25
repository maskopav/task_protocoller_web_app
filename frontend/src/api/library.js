// src/api/library.js — the protocol library.
import { apiJson } from "./apiClient";
import { toQuery } from "./uploads";

// params: { q, lang, mine }
export const listLibrary = (params) => apiJson(`/library${toQuery(params)}`, { fallback: "library_fetch_failed" });
export const getLibraryEntry = (id) => apiJson(`/library/${id}`, { fallback: "library_fetch_failed" });
// -> { protocol_id }
export const copyFromLibrary = (id, { project_id, name }) =>
  apiJson(`/library/${id}/copy`, { method: "POST", body: { project_id, name }, fallback: "library_copy_failed" });
export const withdrawEntry = (id) =>
  apiJson(`/library/${id}/withdraw`, { method: "POST", fallback: "library_withdraw_failed" });
