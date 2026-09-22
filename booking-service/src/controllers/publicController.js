// src/controllers/publicController.js — the browser-facing surface. No API
// key ever reaches here: slot listing + booking creation are gated by an
// HMAC-signed link (verifyBookingLink), and manage/reschedule/cancel are
// gated by the booking's own manage_token (the token itself is the
// credential — same trust model as this app's participant access_token).
import * as bookingService from "../services/bookingService.js";
import { verifyBookingLink, buildSignedBookingUrl } from "../utils/linkSigning.js";
import { getTenantById } from "../services/bookingService.js";
import { executeQuery } from "../db/queryHelper.js";
import { upsertSlotEvent } from "../services/googleCalendarService.js";
import { sendBookingConfirmationEmail, sendBookingRescheduledEmail, sendBookingCancelledEmail, sendNoSlotFollowupEmail } from "../services/emailService.js";
import { dispatchWebhookEvent } from "../services/webhookDispatcher.js";
import { logToFile } from "../utils/logger.js";
import { isPastCutoff, nowAsMysqlDateTime } from "../utils/dateHelpers.js";
import { handleError } from "../utils/httpErrors.js";

const RESCHEDULE_CUTOFF_HOURS = 24;
const REBOOK_LINK_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Mirrors the client-side check in public/book.js — that one is only a UX
// nicety, since these are public POST endpoints anyone can call directly.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,20}$/;

// Shared by createPublicBooking and reportNoSlot -- both collect the same
// two fields, just with a different "required" message for what else is
// missing alongside them.
function contactFormatError(email, phone) {
  if (!EMAIL_RE.test(email)) return "Invalid email address";
  if (!PHONE_RE.test(phone)) return "Invalid phone number";
  return null;
}

async function resolveSignedResource(req) {
  const { resourceSlug } = req.params;
  const { tenant: tenantId, ref, after, exp, sig } = req.query;

  if (!tenantId || !ref || !after || !exp || !sig) {
    const err = new Error("Missing link parameters");
    err.statusCode = 400;
    throw err;
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    const err = new Error("Invalid link");
    err.statusCode = 401;
    throw err;
  }

  const valid = verifyBookingLink(tenant.link_signing_secret, { tenantId, resourceSlug, ref, after, exp }, sig);
  if (!valid) {
    const err = new Error("Invalid or expired link");
    err.statusCode = 401;
    throw err;
  }

  const resource = await bookingService.getResourceBySlug(tenant.id, resourceSlug);
  if (!resource) {
    const err = new Error("Unknown resource");
    err.statusCode = 404;
    throw err;
  }

  return { tenant, resource, ref, after };
}

// If this (resource, ref) already has an active appointment, the /book page
// redirects straight to /manage/:manageToken (reschedule/cancel, no slot
// picker) instead of showing slots. Otherwise it returns the open slots plus
// any contact info already on file for this ref, so the page can skip
// re-asking for it.
export async function getPublicSlots(req, res) {
  try {
    const { resource, ref, after } = await resolveSignedResource(req);
    const resourceInfo = { name: resource.name, defaultLocation: resource.default_location };

    const activeManageToken = await bookingService.getActiveManageTokenByRef(resource.id, ref);
    if (activeManageToken) {
      return res.json({ resource: resourceInfo, existingBooking: { manageToken: activeManageToken } });
    }

    const [slots, knownContact] = await Promise.all([
      bookingService.listAvailablePublicSlots(resource.id, after),
      bookingService.getLatestContactByRef(resource.id, ref),
    ]);
    res.json({ resource: resourceInfo, slots, knownContact });
  } catch (err) {
    handleError(res, err, "Failed to load slots");
  }
}

// "None of these times work for me" — no slot is booked, just contact info
// + a free-text note for staff to follow up on manually. Auth is the same
// signed link as getPublicSlots (proves this is a real, current
// participant), not a manage_token, since there's no booking to attach one
// to yet.
export async function reportNoSlot(req, res) {
  const { email, phone, preferredTimes, lang } = req.body;
  if (!email || !phone) {
    return res.status(400).json({ error: "email and phone are required" });
  }
  const formatError = contactFormatError(email, phone);
  if (formatError) return res.status(400).json({ error: formatError });

  try {
    const { tenant, resource, ref, after } = await resolveSignedResource(req);
    await bookingService.reportNoSlotAvailable({
      resourceId: resource.id, externalRef: ref, email, phone, preferredTimes, eligibleAfter: after,
    });

    // The same signed /book link the participant arrived on (a fresh 30-day
    // one, not the possibly-near-expiry one from this request) — visiting it
    // again now finds the contact info just submitted here on file and skips
    // asking for it a second time (see getPublicSlots' knownContact).
    sendNoSlotFollowupEmail({
      to: email, resourceName: resource.name,
      selfBookingLink: buildSignedBookingUrl({
        publicBaseUrl: process.env.PUBLIC_BASE_URL, secret: tenant.link_signing_secret,
        tenantId: tenant.id, resourceSlug: resource.slug, ref, after,
        ttlSeconds: REBOOK_LINK_TTL_SECONDS, lang,
      }),
      contactInfo: resource.contact_info, locale: lang,
    }).catch((err) => logToFile("ERROR", "No-slot follow-up email send threw unexpectedly", { error: err.message }));

    res.status(201).json({ ok: true });
  } catch (err) {
    handleError(res, err, "Failed to submit request");
  }
}

function manageLinkFor(manageToken, locale) {
  const base = `${process.env.PUBLIC_BASE_URL}/manage/${manageToken}`;
  return locale ? `${base}?lang=${encodeURIComponent(locale)}` : base;
}

export async function createPublicBooking(req, res) {
  const { slotId, email, phone, lang } = req.body;
  if (!slotId || !email || !phone) {
    return res.status(400).json({ error: "slotId, email and phone are required" });
  }
  const formatError = contactFormatError(email, phone);
  if (formatError) return res.status(400).json({ error: formatError });

  try {
    const { tenant, resource, ref, after } = await resolveSignedResource(req);
    const { bookingId, manageToken, slotId: bookedSlotId } = await bookingService.createBooking({
      resourceId: resource.id, slotId, externalRef: ref, email, phone, locale: lang, eligibleAfter: after,
    });

    const [slotRow] = await executeQuery(`SELECT starts_at, ends_at, location, google_event_id FROM slots WHERE id = ?`, [bookedSlotId]);
    const location = slotRow.location || resource.default_location;

    // The booking itself is already committed at this point — Calendar
    // push and the email send are both slow (real network round-trips to
    // Google/SMTP) and neither can fail the booking (googleCalendarService
    // and emailService already catch their own errors internally), so none
    // of this blocks the response. Without this, respondents were seeing
    // the confirm button sit unresponsive for several seconds. Matches the
    // fire-and-forget pattern dispatchWebhookEvent already uses below.
    //
    // The slot already has its own Calendar event from when it was
    // generated (styled "available") — this flips that same event to
    // "booked" rather than creating a second one for the same time slot.
    upsertSlotEvent({
      eventId: slotRow.google_event_id, resourceName: resource.name,
      startsAt: slotRow.starts_at, endsAt: slotRow.ends_at, location, status: "booked",
      systemNotes: [`Ref: ${ref}`, `Contact: ${email}, ${phone}`], contactEmail: email,
    })
      .then((eventId) => eventId && bookingService.setSlotGoogleEventId(bookedSlotId, eventId))
      .catch((err) => logToFile("ERROR", "Failed to sync booking to Calendar", { bookingId, error: err.message }));

    sendBookingConfirmationEmail({
      to: email, resourceName: resource.name, startsAt: slotRow.starts_at, endsAt: slotRow.ends_at,
      location, manageLink: manageLinkFor(manageToken, lang), locale: lang,
    }).catch((err) => logToFile("ERROR", "Confirmation email send threw unexpectedly", { bookingId, error: err.message }));

    dispatchWebhookEvent(tenant.id, "booking.created", { externalRef: ref, startsAt: slotRow.starts_at, status: "booked" });

    res.status(201).json({ manageToken, startsAt: slotRow.starts_at, endsAt: slotRow.ends_at, location });
  } catch (err) {
    handleError(res, err, "Failed to create booking");
  }
}

export async function getManageBooking(req, res) {
  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    // A status=requested row (see reportNoSlotAvailable) shares this same
    // manage_token mechanism but isn't a booking yet -- it's never surfaced
    // through /book's existingBooking check (see getPublicSlots) either,
    // since it's not an active appointment.
    if (!booking || booking.status === "requested") return res.status(404).json({ error: "Booking not found" });
    res.json({ booking });
  } catch (err) {
    handleError(res, err, "Failed to load booking");
  }
}

// Reschedule slot browsing is authorized by the manage_token alone (no
// signed link needed — the participant already proved they hold this
// booking). Floored by whichever is later of "now" and the booking's own
// eligible_after (set at createBooking time from the original signed
// link's "after") — the original booking already satisfied eligible_after
// once, but a reschedule could otherwise move it earlier than that, so the
// picker only ever offers slots that keep satisfying it. rescheduleBooking
// re-enforces the same floor server-side regardless, since this is what
// gates what's merely *offered*, not what's *accepted*.
export async function getAvailableSlotsForReschedule(req, res) {
  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    if (!booking || ["cancelled", "requested"].includes(booking.status)) return res.status(404).json({ error: "Booking not found" });

    const now = nowAsMysqlDateTime();
    const floor = booking.eligible_after > now ? booking.eligible_after : now;
    const slots = await bookingService.listAvailablePublicSlots(booking.resource_id, floor);
    res.json({ slots });
  } catch (err) {
    handleError(res, err, "Failed to load available slots");
  }
}

export async function rescheduleManageBooking(req, res) {
  const { newSlotId } = req.body;
  if (!newSlotId) return res.status(400).json({ error: "newSlotId is required" });

  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    if (!booking || ["cancelled", "requested"].includes(booking.status)) return res.status(404).json({ error: "Booking not found" });

    if (isPastCutoff(booking.starts_at, RESCHEDULE_CUTOFF_HOURS)) {
      return res.status(409).json({ error: "Too close to the appointment to reschedule (cutoff: 1 day before)" });
    }

    const { oldSlot, newSlot } = await bookingService.rescheduleBooking(req.params.manageToken, newSlotId);
    const location = newSlot.location || booking.default_location;

    // Fire-and-forget — same reasoning as createPublicBooking: the
    // reschedule is already committed, Calendar/email are slow and can't
    // fail it, so don't make the respondent wait on them.
    //
    // Two separate events to update, not one: the old slot reverts to
    // "available" (it's open again), the new slot flips to "booked" — each
    // event belongs to its own time slot and outlives this one booking.
    upsertSlotEvent({
      eventId: oldSlot.googleEventId, resourceName: booking.resource_name,
      startsAt: oldSlot.startsAt, endsAt: oldSlot.endsAt,
      location: oldSlot.location || booking.default_location, status: "available",
    }).catch((err) => logToFile("ERROR", "Failed to revert old slot's Calendar event", { bookingId: booking.id, error: err.message }));

    upsertSlotEvent({
      eventId: newSlot.googleEventId, resourceName: booking.resource_name,
      startsAt: newSlot.startsAt, endsAt: newSlot.endsAt, location, status: "booked",
      systemNotes: [`Ref: ${booking.external_ref}`, `Contact: ${booking.contact_email}, ${booking.contact_phone}`],
      contactEmail: booking.contact_email,
    })
      .then((eventId) => eventId && bookingService.setSlotGoogleEventId(newSlot.id, eventId))
      .catch((err) => logToFile("ERROR", "Failed to sync rescheduled booking to Calendar", { bookingId: booking.id, error: err.message }));

    sendBookingRescheduledEmail({
      to: booking.contact_email, resourceName: booking.resource_name,
      startsAt: newSlot.startsAt, endsAt: newSlot.endsAt, location,
      manageLink: manageLinkFor(req.params.manageToken, booking.locale), locale: booking.locale,
    }).catch((err) => logToFile("ERROR", "Reschedule email send threw unexpectedly", { bookingId: booking.id, error: err.message }));

    dispatchWebhookEvent(booking.tenant_id, "booking.rescheduled", {
      externalRef: booking.external_ref, startsAt: newSlot.startsAt, status: "booked",
    });

    res.json({ startsAt: newSlot.startsAt, endsAt: newSlot.endsAt, location });
  } catch (err) {
    handleError(res, err, "Failed to reschedule booking");
  }
}

export async function cancelManageBooking(req, res) {
  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    if (!booking || ["cancelled", "requested"].includes(booking.status)) return res.status(404).json({ error: "Booking not found" });

    if (isPastCutoff(booking.starts_at, RESCHEDULE_CUTOFF_HOURS)) {
      return res.status(409).json({ error: "Too close to the appointment to cancel (cutoff: 1 day before)" });
    }

    // cancelBooking and the tenant lookup are independent (tenant_id is
    // already known from the getBookingByManageToken call above) — run them
    // concurrently rather than paying for two sequential DB round-trips.
    const [, tenant] = await Promise.all([
      bookingService.cancelBooking(req.params.manageToken),
      getTenantById(booking.tenant_id),
    ]);

    // A fresh signed link so a cancelled respondent can rebook without going
    // back through the original app — carries forward the same
    // eligible_after the cancelled booking had (not "today"): a cancellation
    // can happen well before the appointment date, e.g. right after booking,
    // and "today" would let them immediately rebook earlier than the
    // 14-day-after-completion floor. createBooking persists eligible_after
    // on this fresh booking too, once they actually rebook, so the floor
    // keeps propagating through any further cancel/rebook cycles.
    const rebookLink = tenant
      ? buildSignedBookingUrl({
          publicBaseUrl: process.env.PUBLIC_BASE_URL, secret: tenant.link_signing_secret,
          tenantId: booking.tenant_id, resourceSlug: booking.resource_slug, ref: booking.external_ref,
          after: booking.eligible_after, ttlSeconds: REBOOK_LINK_TTL_SECONDS,
          lang: booking.locale,
        })
      : null;

    // Fire-and-forget — same reasoning as the other two handlers above.
    // The slot itself still exists and is bookable again, so its Calendar
    // event reverts to "available" rather than being deleted.
    upsertSlotEvent({
      eventId: booking.google_event_id, resourceName: booking.resource_name,
      startsAt: booking.starts_at, endsAt: booking.ends_at,
      location: booking.location || booking.default_location, status: "available",
    }).catch((err) => logToFile("ERROR", "Failed to revert cancelled slot's Calendar event", { bookingId: booking.id, error: err.message }));
    sendBookingCancelledEmail({
      to: booking.contact_email, resourceName: booking.resource_name, startsAt: booking.starts_at,
      rebookLink, contactInfo: booking.contact_info, locale: booking.locale,
    })
      .catch((err) => logToFile("ERROR", "Cancellation email send threw unexpectedly", { bookingId: booking.id, error: err.message }));
    dispatchWebhookEvent(booking.tenant_id, "booking.cancelled", { externalRef: booking.external_ref, status: "cancelled" });

    res.status(204).end();
  } catch (err) {
    handleError(res, err, "Failed to cancel booking");
  }
}
