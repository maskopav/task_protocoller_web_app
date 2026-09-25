// src/config/features.js
// Build-time feature flags, controlled via Vite env vars (frontend/.env.*).
// Defaults to enabled so omitting the var preserves current behavior.
export const RESERVATIONS_ENABLED = import.meta.env.VITE_ENABLE_RESERVATIONS !== "false";
