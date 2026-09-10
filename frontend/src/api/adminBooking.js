// frontend/src/api/adminBooking.js — admin-only, goes through this app's
// own backend proxy (backend/src/routes/adminBooking.js), which holds
// booking-service's API key server-side. The admin JWT (via apiFetch) is
// all the browser ever needs.
import { apiFetch } from "./apiClient";

export async function bulkCreateSlots({ startDate, endDate, weekdays, startTime, endTime, durationMin, location }) {
  const res = await apiFetch(`/admin/booking/slots/bulk`, {
    method: "POST",
    body: JSON.stringify({ startDate, endDate, weekdays, startTime, endTime, durationMin, location }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create slots");
  return data; // { created, skipped }
}

export async function fetchSlots({ activeOnly } = {}) {
  const qs = activeOnly ? "?activeOnly=true" : "";
  const res = await apiFetch(`/admin/booking/slots${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load slots");
  }
  return res.json(); // { slots }
}

export async function deleteSlot(slotId) {
  const res = await apiFetch(`/admin/booking/slots/${slotId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete slot");
  }
}

export async function fetchBookings() {
  const res = await apiFetch(`/admin/booking/bookings`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load bookings");
  }
  return res.json(); // { bookings }
}

// Same blob-download pattern as api/sessionData.js's downloadSessionDataZip.
export async function downloadBookingsCsv() {
  const res = await apiFetch(`/admin/booking/bookings/export.csv`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to export bookings");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "bookings.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
