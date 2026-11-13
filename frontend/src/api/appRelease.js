// src/api/appRelease.js — the desktop release this server serves (GET /app-release).
// Master or can_see_technical; the server re-checks the flag on every call.
import { apiJson } from "./apiClient";

// -> { release: null | { version, publishedAt, bundles: [{ name, size, sha256, latestPath, versionedPath }] },
//      publicBaseUrl: string | null }
export const fetchAppRelease = () => apiJson("/app-release", { fallback: "app_release_failed" });
