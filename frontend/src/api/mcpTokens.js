// src/api/mcpTokens.js — MCP personal access tokens (docs/mcp/01_spec.md 3.3).
import { apiFetch, apiJson, readJson } from "./apiClient";

// -> { allowed, tokens: [{ id, name, prefix, createdAt, lastUsedAt, expiresAt, revokedAt, active }] }
export const fetchMyTokens = () => apiJson("/account/mcp-tokens", { fallback: "mcp_tokens_failed" });

// -> { ...row, token } — the token is shown this once.
export const createMyToken = ({ name, expiresInDays }) =>
  apiJson("/account/mcp-tokens", { method: "POST", body: { name, expiresInDays }, fallback: "mcp_token_create_failed" });

async function noContent(path, fallback) {
  const res = await apiFetch(path, { method: "DELETE" });
  if (res.status === 204) return null;
  return readJson(res, fallback);
}

export const revokeMyToken = (id) => noContent(`/account/mcp-tokens/${id}`, "mcp_token_revoke_failed");

// Master: someone else's tokens. -> { tokens }
export const fetchUserTokens = (userId) => apiJson(`/users/${userId}/mcp-tokens`, { fallback: "mcp_tokens_failed" });
export const revokeUserToken = (userId, tokenId) =>
  noContent(`/users/${userId}/mcp-tokens/${tokenId}`, "mcp_token_revoke_failed");
