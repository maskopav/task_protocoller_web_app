// src/utils/linkSigning.js
//
// Public booking links never carry the tenant's raw API key (that stays
// server-to-server only). Instead the calling app's backend signs a small
// set of parameters with the tenant's link_signing_secret; this service
// re-derives the same signature and compares. This is also reused to sign
// outgoing webhook payloads (webhooks.secret plays the same role).
import crypto from "crypto";

// Deterministic order matters — both signer and verifier must build the
// same string from the same fields.
export function buildLinkSignaturePayload({ tenantId, resourceSlug, ref, after, exp }) {
  return `${tenantId}|${resourceSlug}|${ref}|${after}|${exp}`;
}

export function signHmac(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmac(secret, payload, providedSigHex) {
  const expected = signHmac(secret, payload);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(String(providedSigHex || ""), "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function verifyBookingLink(secret, { tenantId, resourceSlug, ref, after, exp }, sig) {
  if (!exp || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const payload = buildLinkSignaturePayload({ tenantId, resourceSlug, ref, after, exp });
  return verifyHmac(secret, payload, sig);
}
