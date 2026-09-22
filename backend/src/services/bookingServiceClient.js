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

// The reschedule/cancel link for an already-booked respondent — the exact
// same link they were actually emailed (see booking-service's emailService
// manageLinkFor), so the Fieldwork table's link column matches reality
// instead of always re-showing the original slot-picker link. No signing
// needed: manage_token itself is the credential (booking-service trusts
// possession of it the same way this app trusts a participant access_token).
export function buildManageLink({ manageToken, lang }) {
  const params = new URLSearchParams();
  if (lang) params.set("lang", lang);
  const qs = params.toString();
  return `${env("BOOKING_SERVICE_URL")}/manage/${manageToken}${qs ? `?${qs}` : ""}`;
}

// ---- admin proxy ---------------------------------------------------------

// The public BOOKING_SERVICE_URL is right for links opened by a
// participant's own browser (buildBookingLink, above), but wrong for
// server-to-server admin calls when mounted: that would mean this server
// calling out to its own public HTTPS address and back in again through
// whatever reverse proxy/firewall sits in front of it — a "hairpin" request
// pattern that fails outright on some hosting setups even though the exact
// same path works fine from a real external client. When mounted, this
// process already has booking-service listening in-process on its own
// PORT, so the admin proxy talks to that over plain loopback HTTP instead —
// no DNS, no TLS, no proxy hop. BOOKING_SERVICE_INTERNAL_URL overrides this
// explicitly if the default guess is ever wrong for a given deployment.
function adminApiBaseUrl() {
  if (process.env.BOOKING_SERVICE_INTERNAL_URL) return process.env.BOOKING_SERVICE_INTERNAL_URL;
  if (process.env.MOUNT_BOOKING_SERVICE === "true") {
    const port = process.env.PORT || 3000;
    return `http://127.0.0.1:${port}/booking-service`;
  }
  return env("BOOKING_SERVICE_URL");
}

async function bookingServiceFetch(path, options = {}) {
  requireConfig();
  return fetch(`${adminApiBaseUrl()}${path}`, {
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
//
// Caches the in-flight *promise*, not just the eventual id — the admin
// page loads slots and bookings concurrently (Promise.all), so two calls
// can land within milliseconds of each other on a cold cache. Caching only
// the final id left both racing to list-then-create independently, and the
// loser got back a raw DB duplicate-key error instead of the winner's
// resource (hit in real deployment). Sharing one in-flight promise means
// the second caller just awaits the first's result instead of starting its
// own attempt. On failure the cache is cleared so the next call can retry
// rather than permanently caching a rejection.
let resourceIdPromise = null;

export async function ensureFollowupBookingResource() {
  if (!resourceIdPromise) {
    resourceIdPromise = resolveFollowupBookingResource().catch((err) => {
      resourceIdPromise = null;
      throw err;
    });
  }
  return resourceIdPromise;
}

async function resolveFollowupBookingResource() {
  const resourceSlug = env("BOOKING_SERVICE_RESOURCE_SLUG", "standardized-room-retest");

  const listRes = await bookingServiceFetch("/v1/resources");
  if (!listRes.ok) throw new Error(`Failed to list booking-service resources (${listRes.status})`);
  const { resources } = await listRes.json();

  const existing = resources.find((r) => r.slug === resourceSlug);
  if (existing) return existing.id;

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
  return created.id;
}

// Thin passthrough used by adminBookingController.js — callers add
// resourceId to the query/body themselves via ensureFollowupBookingResource
// above, this just forwards with auth attached.
export async function proxyBookingRequest(path, options) {
  return bookingServiceFetch(path, options);
}

// ---- Fieldwork integration ------------------------------------------

// Two admin calls to booking-service, reused across every eligible row in a
// Fieldwork response (see projectController.getProjectFieldwork) — not one
// call per participant. booking-service's `external_ref` is this app's
// participant_protocol_id (see buildBookingLink above), so the map is keyed
// by that.
//
// listBookingsForAdmin's query inner-joins on slots, so it never returns a
// "none of these times work for me" report (no slot_id) — those come from
// the separate /v1/no-slot-reports endpoint and are merged in here, tagged
// status 'requested', so case 4 (no slot picked, contact info left) is
// visible in the Fieldwork table at all instead of silently disappearing.
//
// Both endpoints return every historical row for a ref (a cancel-then-rebook
// leaves two; a no-slot report followed by an eventual real booking leaves
// two more), so per ref this keeps whichever is still an active appointment
// ('booked'/'rescheduled') if one exists, otherwise whichever of the
// remaining rows (cancelled or requested) was updated most recently — never
// an older, superseded row.
const ACTIVE_BOOKING_STATUSES = new Set(["booked", "rescheduled"]);

export async function getFollowupBookingStatusByRef() {
  const resourceId = await ensureFollowupBookingResource();
  const [bookingsUpstream, noSlotUpstream] = await Promise.all([
    proxyBookingRequest(`/v1/bookings?resourceId=${resourceId}`),
    proxyBookingRequest(`/v1/no-slot-reports?resourceId=${resourceId}`),
  ]);
  if (!bookingsUpstream.ok) throw new Error(`Failed to list bookings (${bookingsUpstream.status})`);
  if (!noSlotUpstream.ok) throw new Error(`Failed to list no-slot reports (${noSlotUpstream.status})`);
  const { bookings } = await bookingsUpstream.json();
  const { reports } = await noSlotUpstream.json();

  const byRef = new Map();
  function consider(b) {
    const existing = byRef.get(b.external_ref);
    if (!existing) {
      byRef.set(b.external_ref, b);
      return;
    }
    const bActive = ACTIVE_BOOKING_STATUSES.has(b.status);
    const existingActive = ACTIVE_BOOKING_STATUSES.has(existing.status);
    if (bActive !== existingActive) {
      if (bActive) byRef.set(b.external_ref, b);
      return;
    }
    if ((b.updated_at || b.created_at) > (existing.updated_at || existing.created_at)) {
      byRef.set(b.external_ref, b);
    }
  }
  for (const b of bookings) consider(b);
  for (const r of reports) consider({ ...r, status: "requested" });
  return byRef;
}
