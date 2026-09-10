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

// Builds a full, ready-to-send signed booking URL. Single source of truth
// for link construction, used both server-side (e.g. the "book again" link
// in the cancellation email) and by scripts/generateSignedLink.js for
// manual dev/prod testing — keeps them from drifting out of sync.
// `lang` is deliberately not part of the signed payload — it's a display
// preference, not something that needs tamper protection — so it's just
// appended to the querystring.
export function buildSignedBookingUrl({ publicBaseUrl, secret, tenantId, resourceSlug, ref, after, ttlSeconds = 3600, lang }) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signHmac(secret, buildLinkSignaturePayload({ tenantId, resourceSlug, ref, after, exp }));
  const params = { tenant: String(tenantId), ref, after, exp: String(exp), sig };
  if (lang) params.lang = lang;
  const qs = new URLSearchParams(params).toString();
  return `${publicBaseUrl}/book/${resourceSlug}?${qs}`;
}
