// src/controllers/adminBookingController.js — thin passthrough to
// booking-service's admin API (bookingServiceClient.js), so the frontend
// admin UI never needs booking-service's API key: it just calls this app's
// own /admin/booking/* routes with the admin JWT it already has.
import { ensureFollowupBookingResource, proxyBookingRequest } from "../services/bookingServiceClient.js";
import { logToFile } from "../utils/logger.js";

function handleProxyError(res, err, fallbackMessage) {
  logToFile("ERROR", fallbackMessage, { error: err.message });
  res.status(502).json({ error: err.message || fallbackMessage });
}

export const bulkCreateSlots = async (req, res) => {
  try {
    const resourceId = await ensureFollowupBookingResource();
    const upstream = await proxyBookingRequest("/v1/slots/bulk", {
      method: "POST",
      body: JSON.stringify({ ...req.body, resourceId }),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    handleProxyError(res, err, "Failed to create slots");
  }
};

export const listSlots = async (req, res) => {
  try {
    const resourceId = await ensureFollowupBookingResource();
    const activeOnlyQs = req.query.activeOnly === "true" ? "&activeOnly=true" : "";
    const upstream = await proxyBookingRequest(`/v1/slots?resourceId=${resourceId}${activeOnlyQs}`);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    handleProxyError(res, err, "Failed to list slots");
  }
};

export const deleteSlot = async (req, res) => {
  try {
    const resourceId = await ensureFollowupBookingResource();
    const upstream = await proxyBookingRequest(`/v1/slots/${req.params.slotId}?resourceId=${resourceId}`, { method: "DELETE" });
    if (upstream.status === 204) return res.status(204).end();
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    handleProxyError(res, err, "Failed to delete slot");
  }
};

export const listBookings = async (req, res) => {
  try {
    const resourceId = await ensureFollowupBookingResource();
    const upstream = await proxyBookingRequest(`/v1/bookings?resourceId=${resourceId}`);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    handleProxyError(res, err, "Failed to list bookings");
  }
};

export const exportBookingsCsv = async (req, res) => {
  try {
    const resourceId = await ensureFollowupBookingResource();
    const upstream = await proxyBookingRequest(`/v1/bookings/export.csv?resourceId=${resourceId}`);
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json(data);
    }
    const text = await upstream.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="bookings.csv"');
    res.send(text);
  } catch (err) {
    handleProxyError(res, err, "Failed to export bookings");
  }
};
