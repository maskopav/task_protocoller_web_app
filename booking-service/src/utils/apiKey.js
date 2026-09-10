// src/utils/apiKey.js — server-to-server admin API credentials.
// The raw key is only ever shown once, at tenant-creation time (see
// scripts/createTenant.js); only its sha256 hash is persisted, so a leaked
// DB dump doesn't hand out usable keys.
import crypto from "crypto";

const PREFIX = "bksvc_";

export function generateApiKey() {
  return `${PREFIX}${crypto.randomBytes(24).toString("hex")}`;
}

export function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}
