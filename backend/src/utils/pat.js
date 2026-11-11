// src/utils/pat.js
//
// MCP personal access tokens (docs/mcp/01_spec.md section 3.2):
// "tpm_" + base64url(32 random bytes). Only the sha256 hex is stored.
import crypto from "crypto";

export const PAT_PREFIX = "tpm_";
const PAT_FORMAT = /^tpm_[A-Za-z0-9_-]{43}$/;

/** sha256 hex of the full token, the only form that reaches the DB. */
export const hashPat = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Cheap shape check before any DB lookup. */
export const isPatFormat = (token) => typeof token === "string" && PAT_FORMAT.test(token);

/** A fresh token: the secret (shown once), its hash, and the list prefix. */
export function generatePat() {
  const token = PAT_PREFIX + crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashPat(token), prefix: token.slice(0, 12) };
}
