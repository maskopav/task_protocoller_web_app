// src/pages/account/mcpSetup.js — pure helpers for the MCP section of the
// Account page: the endpoint URL, client setup snippets, token status.
import { API_BASE } from "../../api/apiClient";

export const EXPIRY_OPTIONS = [30, 90, 365];
export const DEFAULT_EXPIRY = 90;
export const SERVER_NAME = "task-protocoller";
const TOKEN_PLACEHOLDER = "tpm_…";

/**
 * The public /mcp URL. VITE_API_BASE is either absolute (dev: http://localhost:3000)
 * or relative to the page (production: ./api), so it resolves against the page
 * URL without its #/route.
 */
export function mcpEndpoint(apiBase = API_BASE, href = typeof window === "undefined" ? "http://localhost/" : window.location.href) {
  const base = String(apiBase ?? "").replace(/\/+$/, "");
  return new URL(`${base}/mcp`, href.split("#")[0]).href;
}

/** Setup snippets per client. `token` defaults to a placeholder so nothing secret is shown by default. */
export function clientSnippets(endpoint, token = TOKEN_PLACEHOLDER) {
  const vscode = {
    inputs: [{ id: "tp-token", type: "promptString", password: true, description: "Task Protocoller MCP token" }],
    servers: { [SERVER_NAME]: { type: "http", url: endpoint, headers: { Authorization: "Bearer ${input:tp-token}" } } },
  };
  // mcp-remote bridges clients that only start local (stdio) servers. The header
  // goes through an env var: a space inside args breaks some clients on Windows.
  const bridge = {
    mcpServers: {
      [SERVER_NAME]: {
        command: "npx",
        args: ["-y", "mcp-remote", endpoint, "--header", "Authorization:${TP_AUTH}"],
        env: { TP_AUTH: `Bearer ${token}` },
      },
    },
  };
  return [
    { key: "claudeCode", code: `claude mcp add --transport http ${SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${token}"` },
    { key: "vscode", code: JSON.stringify(vscode, null, 2) },
    { key: "bridge", code: JSON.stringify(bridge, null, 2) },
  ];
}

/** "active" | "expired" | "revoked" */
export function tokenStatus(t, now = Date.now()) {
  if (t?.revokedAt) return "revoked";
  if (t?.active === false) return "expired";
  if (t?.expiresAt && Date.parse(t.expiresAt) <= now) return "expired";
  return "active";
}

export const activeCount = (tokens, now) => (tokens ?? []).filter((t) => tokenStatus(t, now) === "active").length;
