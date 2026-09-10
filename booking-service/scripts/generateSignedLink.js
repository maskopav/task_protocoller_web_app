// scripts/generateSignedLink.js — dev/ops convenience: hand-build a signed
// booking link the way a consuming app's backend would, so booking-service
// can be tested (dev iteration, or a production smoke test) without a real
// integration wired up yet. Not used by the running service itself — a
// real consuming app signs its own links server-side using this same HMAC
// scheme (see src/utils/linkSigning.js).
//
// Usage:
//   npm run link:generate -- <tenantId> <linkSigningSecret> <resourceSlug> <ref> <afterDate> [ttlSeconds]
//
// Example:
//   npm run link:generate -- 1 5b9a930b78fbf6... standardized-room-retest participant-42 2026-09-13
import "dotenv/config";
import { buildSignedBookingUrl } from "../src/utils/linkSigning.js";

const [tenantId, secret, resourceSlug, ref, after, ttlSecondsArg] = process.argv.slice(2);

if (!tenantId || !secret || !resourceSlug || !ref || !after) {
  console.error("Usage: npm run link:generate -- <tenantId> <linkSigningSecret> <resourceSlug> <ref> <afterDate> [ttlSeconds]");
  process.exit(1);
}

const ttlSeconds = Number(ttlSecondsArg) || 3600;
const url = buildSignedBookingUrl({
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:4100",
  secret, tenantId, resourceSlug, ref, after, ttlSeconds,
});

console.log(`\n${url}\n`);
console.log(`Expires in ${ttlSeconds}s.`);
