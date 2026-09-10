// src/services/bookingServiceClient.js — the only place in this app that
// holds booking-service's server-to-server credentials. Two jobs:
//   1. Build signed booking links for participants (buildBookingLink) —
//      no API key involved, just the tenant's link-signing secret.
//   2. Proxy admin operations (slot generation, bookings list/export) to
//      booking-service's admin API, so the browser never sees the API key
//      (see adminBookingController.js, the only caller of the proxy half).
//
// booking-service is a separate, standalone package (../../../booking-service)
// that shares no code with this app — see its README. The HMAC scheme here
// deliberately duplicates booking-service/src/utils/linkSigning.js rather
// than importing it, since these are two independently deployable services.
import crypto from "crypto";
import { logToFile } from "../utils/logger.js";

function env(name, fallback) {
  return process.env[name] || fallback;
}

function requireConfig() {
  const missing = ["BOOKING_SERVICE_URL", "BOOKING_SERVICE_API_KEY", "BOOKING_SERVICE_TENANT_ID", "BOOKING_SERVICE_LINK_SIGNING_SECRET"]
    .filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`booking-service is not configured — missing env var(s): ${missing.join(", ")}`);
  }
}

const DEFAULT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — long enough a participant who doesn't book immediately still has a working link days later.

// completedAt is a MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS", this app's
// pool is configured with dateStrings:true) representing when the protocol
// was finished (sessions.completed_at). Returns "YYYY-MM-DD".
export function computeEligibilityDate(completedAt, eligibilityDays) {
  const completed = new Date(completedAt.replace(" ", "T") + "Z");
  completed.setUTCDate(completed.getUTCDate() + eligibilityDays);
  return completed.toISOString().slice(0, 10);
}

function signBookingLink({ tenantId, resourceSlug, ref, after, exp, secret }) {
  const payload = `${tenantId}|${resourceSlug}|${ref}|${after}|${exp}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// ref correlates the booking back to this app's own record of who it's
// for. participant_protocol_id is used (not a fresh secret token) — it's
// already an internal DB id this app treats as non-sensitive elsewhere
// (e.g. session ids in PUT /sessions/:id/identifiers), and booking-service
// has no way to look anything up from it beyond echoing it back in its own
// admin bookings list/CSV/webhooks.
export function buildBookingLink({ ref, completedAt, eligibilityDays, lang, ttlSeconds = DEFAULT_LINK_TTL_SECONDS }) {
  requireConfig();

  const tenantId = env("BOOKING_SERVICE_TENANT_ID");
  const resourceSlug = env("BOOKING_SERVICE_RESOURCE_SLUG", "standardized-room-retest");
  const secret = env("BOOKING_SERVICE_LINK_SIGNING_SECRET");

  const after = computeEligibilityDate(completedAt, eligibilityDays);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signBookingLink({ tenantId, resourceSlug, ref: String(ref), after, exp, secret });

  const params = new URLSearchParams({ tenant: tenantId, ref: String(ref), after, exp: String(exp), sig });
  if (lang) params.set("lang", lang);

  return `${env("BOOKING_SERVICE_URL")}/book/${resourceSlug}?${params.toString()}`;
}

// ---- admin proxy ---------------------------------------------------------

async function bookingServiceFetch(path, options = {}) {
  requireConfig();
  return fetch(`${env("BOOKING_SERVICE_URL")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env("BOOKING_SERVICE_API_KEY")}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

// Resolved once per process and cached — booking-service resources are
// essentially static config (a room), not something that changes at
// request time. Re-resolves automatically after a process restart, so a
// resource created directly against booking-service (bypassing this cache)
// is picked up on next boot without any manual step here.
let cachedResourceId = null;

export async function ensureFollowupBookingResource() {
  if (cachedResourceId) return cachedResourceId;

  const resourceSlug = env("BOOKING_SERVICE_RESOURCE_SLUG", "standardized-room-retest");

  const listRes = await bookingServiceFetch("/v1/resources");
  if (!listRes.ok) throw new Error(`Failed to list booking-service resources (${listRes.status})`);
  const { resources } = await listRes.json();

  const existing = resources.find((r) => r.slug === resourceSlug);
  if (existing) {
    cachedResourceId = existing.id;
    return cachedResourceId;
  }

  logToFile("INFO", "Creating booking-service resource on first use", { resourceSlug });
  const createRes = await bookingServiceFetch("/v1/resources", {
    method: "POST",
    body: JSON.stringify({
      slug: resourceSlug,
      name: env("BOOKING_SERVICE_RESOURCE_NAME", "Standardized Room Retest"),
      defaultDurationMin: Number(env("BOOKING_SERVICE_DEFAULT_DURATION_MIN", "45")),
      defaultLocation: process.env.BOOKING_SERVICE_DEFAULT_LOCATION || undefined,
    }),
  });
  if (!createRes.ok) throw new Error(`Failed to create booking-service resource (${createRes.status})`);
  const created = await createRes.json();
  cachedResourceId = created.id;
  return cachedResourceId;
}

// Thin passthrough used by adminBookingController.js — callers add
// resourceId to the query/body themselves via ensureFollowupBookingResource
// above, this just forwards with auth attached.
export async function proxyBookingRequest(path, options) {
  return bookingServiceFetch(path, options);
}
