// src/controllers/adminController.js — HTTP glue only for the
// server-to-server admin API (Bearer API key, req.tenant set by
// middleware/apiKeyAuth.js). All SQL lives in services/bookingService.js.
import * as bookingService from "../services/bookingService.js";
import { buildCsv } from "../utils/csvBuilder.js";
import { logToFile } from "../utils/logger.js";

function handleError(res, err, fallbackMessage) {
  logToFile("ERROR", fallbackMessage, { error: err.message });
  res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
}

export async function createResource(req, res) {
  const { slug, name, defaultDurationMin, defaultLocation } = req.body;
  if (!slug || !name) {
    return res.status(400).json({ error: "slug and name are required" });
  }
  try {
    const resource = await bookingService.createResource(req.tenant.id, { slug, name, defaultDurationMin, defaultLocation });
    res.status(201).json(resource);
  } catch (err) {
    handleError(res, err, "Failed to create resource");
  }
}

export async function listResources(req, res) {
  try {
    const resources = await bookingService.listResources(req.tenant.id);
    res.json({ resources });
  } catch (err) {
    handleError(res, err, "Failed to list resources");
  }
}

export async function bulkCreateSlots(req, res) {
  const { resourceId, startDate, endDate, weekdays, startTime, endTime, durationMin, location } = req.body;
  if (!resourceId || !startDate || !endDate || !Array.isArray(weekdays) || !startTime || !endTime || !durationMin) {
    return res.status(400).json({ error: "resourceId, startDate, endDate, weekdays[], startTime, endTime, durationMin are required" });
  }
  try {
    const result = await bookingService.bulkCreateSlots(req.tenant.id, resourceId, {
      startDate, endDate, weekdays, startTime, endTime, durationMin, location,
    });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, "Failed to create slots");
  }
}

export async function listSlots(req, res) {
  const resourceId = Number(req.query.resourceId);
  if (!resourceId) return res.status(400).json({ error: "resourceId is required" });
  try {
    const slots = await bookingService.listSlotsForAdmin(req.tenant.id, resourceId, { activeOnly: req.query.activeOnly === "true" });
    res.json({ slots });
  } catch (err) {
    handleError(res, err, "Failed to list slots");
  }
}

export async function deleteSlot(req, res) {
  const resourceId = Number(req.query.resourceId);
  if (!resourceId) return res.status(400).json({ error: "resourceId is required" });
  try {
    await bookingService.deleteSlot(req.tenant.id, resourceId, req.params.slotId);
    res.status(204).end();
  } catch (err) {
    handleError(res, err, "Failed to delete slot");
  }
}

export async function listBookings(req, res) {
  try {
    const bookings = await bookingService.listBookingsForAdmin(req.tenant.id, {
      resourceId: req.query.resourceId ? Number(req.query.resourceId) : undefined,
    });
    res.json({ bookings });
  } catch (err) {
    handleError(res, err, "Failed to list bookings");
  }
}

export async function registerWebhook(req, res) {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    const webhook = await bookingService.registerWebhook(req.tenant.id, url);
    // secret is only ever returned here — store it on the receiving end now.
    res.status(201).json(webhook);
  } catch (err) {
    handleError(res, err, "Failed to register webhook");
  }
}

export async function listWebhooks(req, res) {
  try {
    const webhooks = await bookingService.listWebhooks(req.tenant.id);
    res.json({ webhooks });
  } catch (err) {
    handleError(res, err, "Failed to list webhooks");
  }
}

export async function exportBookingsCsv(req, res) {
  try {
    const bookings = await bookingService.listBookingsForAdmin(req.tenant.id, {
      resourceId: req.query.resourceId ? Number(req.query.resourceId) : undefined,
    });
    const headers = ["Resource", "Starts At", "Ends At", "Location", "Email", "Phone", "Status", "External Ref", "Booked At"];
    const rows = bookings.map((b) => [
      b.resource_name, b.starts_at, b.ends_at, b.location || "", b.contact_email, b.contact_phone, b.status, b.external_ref, b.created_at,
    ]);
    const csv = buildCsv(headers, rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bookings.csv"`);
    res.send(csv);
  } catch (err) {
    handleError(res, err, "Failed to export bookings");
  }
}
