// src/controllers/publicController.js — the browser-facing surface. No API
// key ever reaches here: slot listing + booking creation are gated by an
// HMAC-signed link (verifyBookingLink), and manage/reschedule/cancel are
// gated by the booking's own manage_token (the token itself is the
// credential — same trust model as this app's participant access_token).
import * as bookingService from "../services/bookingService.js";
import { verifyBookingLink } from "../utils/linkSigning.js";
import { getTenantById } from "../services/bookingService.js";
import { executeQuery } from "../db/queryHelper.js";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../services/googleCalendarService.js";
import { sendBookingConfirmationEmail, sendBookingRescheduledEmail, sendBookingCancelledEmail } from "../services/emailService.js";
import { dispatchWebhookEvent } from "../services/webhookDispatcher.js";
import { logToFile } from "../utils/logger.js";
import { isPastCutoff } from "../utils/dateHelpers.js";

const RESCHEDULE_CUTOFF_HOURS = 24;

function handleError(res, err, fallbackMessage) {
  logToFile("ERROR", fallbackMessage, { error: err.message });
  res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
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

export async function getPublicSlots(req, res) {
  try {
    const { resource, after } = await resolveSignedResource(req);
    const slots = await bookingService.listAvailablePublicSlots(resource.id, after);
    res.json({ resource: { name: resource.name, defaultLocation: resource.default_location }, slots });
  } catch (err) {
    handleError(res, err, "Failed to load slots");
  }
}

function manageLinkFor(manageToken) {
  return `${process.env.PUBLIC_BASE_URL}/manage/${manageToken}`;
}

export async function createPublicBooking(req, res) {
  const { slotId, email, phone } = req.body;
  if (!slotId || !email || !phone) {
    return res.status(400).json({ error: "slotId, email and phone are required" });
  }

  try {
    const { tenant, resource, ref } = await resolveSignedResource(req);
    const { bookingId, manageToken, slotId: bookedSlotId } = await bookingService.createBooking({
      resourceId: resource.id, slotId, externalRef: ref, email, phone,
    });

    const [slotRow] = await executeQuery(`SELECT starts_at, ends_at, location FROM slots WHERE id = ?`, [bookedSlotId]);
    const location = slotRow.location || resource.default_location;

    const googleEventId = await createCalendarEvent({
      summary: `${resource.name} — booked`,
      description: `Booking ref: ${ref}`,
      startsAt: slotRow.starts_at, endsAt: slotRow.ends_at, location,
    });
    if (googleEventId) {
      await bookingService.setBookingGoogleEventId(bookingId, googleEventId);
    }

    await sendBookingConfirmationEmail({
      to: email, resourceName: resource.name, startsAt: slotRow.starts_at, endsAt: slotRow.ends_at,
      location, manageLink: manageLinkFor(manageToken),
    });

    dispatchWebhookEvent(tenant.id, "booking.created", { externalRef: ref, startsAt: slotRow.starts_at, status: "booked" });

    res.status(201).json({ manageToken, startsAt: slotRow.starts_at, endsAt: slotRow.ends_at, location });
  } catch (err) {
    handleError(res, err, "Failed to create booking");
  }
}

export async function getManageBooking(req, res) {
  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json({ booking });
  } catch (err) {
    handleError(res, err, "Failed to load booking");
  }
}

// Reschedule slot browsing is authorized by the manage_token alone (no
// signed link needed — the participant already proved they hold this
// booking). Simplification for v1: this shows all future open slots for
// the resource and does not re-check the original 14-day-after-completion
// floor (the booking already satisfied it once); revisit if that matters.
export async function getAvailableSlotsForReschedule(req, res) {
  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    if (!booking || booking.status === "cancelled") return res.status(404).json({ error: "Booking not found" });

    const nowMysql = new Date().toISOString().slice(0, 19).replace("T", " ");
    const slots = await bookingService.listAvailablePublicSlots(booking.resource_id, nowMysql);
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
    if (!booking || booking.status === "cancelled") return res.status(404).json({ error: "Booking not found" });

    if (isPastCutoff(booking.starts_at, RESCHEDULE_CUTOFF_HOURS)) {
      return res.status(409).json({ error: "Too close to the appointment to reschedule (cutoff: 1 day before)" });
    }

    await bookingService.rescheduleBooking(req.params.manageToken, newSlotId);
    const [newSlotRow] = await executeQuery(`SELECT starts_at, ends_at, location FROM slots WHERE id = ?`, [newSlotId]);
    const location = newSlotRow.location || booking.resource_name;

    await updateCalendarEvent(booking.google_event_id, {
      summary: `${booking.resource_name} — booked`,
      description: `Booking ref: ${booking.external_ref}`,
      startsAt: newSlotRow.starts_at, endsAt: newSlotRow.ends_at, location,
    });

    await sendBookingRescheduledEmail({
      to: booking.contact_email, resourceName: booking.resource_name,
      startsAt: newSlotRow.starts_at, endsAt: newSlotRow.ends_at, location,
      manageLink: manageLinkFor(req.params.manageToken),
    });

    dispatchWebhookEvent(booking.tenant_id, "booking.rescheduled", {
      externalRef: booking.external_ref, startsAt: newSlotRow.starts_at, status: "booked",
    });

    res.json({ startsAt: newSlotRow.starts_at, endsAt: newSlotRow.ends_at, location });
  } catch (err) {
    handleError(res, err, "Failed to reschedule booking");
  }
}

export async function cancelManageBooking(req, res) {
  try {
    const booking = await bookingService.getBookingByManageToken(req.params.manageToken);
    if (!booking || booking.status === "cancelled") return res.status(404).json({ error: "Booking not found" });

    if (isPastCutoff(booking.starts_at, RESCHEDULE_CUTOFF_HOURS)) {
      return res.status(409).json({ error: "Too close to the appointment to cancel (cutoff: 1 day before)" });
    }

    await bookingService.cancelBooking(req.params.manageToken);
    await deleteCalendarEvent(booking.google_event_id);
    await sendBookingCancelledEmail({ to: booking.contact_email, resourceName: booking.resource_name, startsAt: booking.starts_at });
    dispatchWebhookEvent(booking.tenant_id, "booking.cancelled", { externalRef: booking.external_ref, status: "cancelled" });

    res.status(204).end();
  } catch (err) {
    handleError(res, err, "Failed to cancel booking");
  }
}
