// src/services/bookingService.js — all SQL for this service lives here.
// No HTTP/format concerns (mirrors task_protocoller_web_app's
// backend/src/services split, e.g. sessionDataService.js).
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import crypto from "crypto";
import { generateToken } from "../utils/tokenGenerator.js";
import { iterateDates, weekdayOf, addMinutesToTime } from "../utils/dateHelpers.js";
import { SUPPORTED_LOCALES } from "../i18n/emailTranslations.js";

// ---- tenants -----------------------------------------------------------

export async function createTenant(name) {
  const rawApiKey = generateApiKey();
  const linkSigningSecret = crypto.randomBytes(32).toString("hex");

  const result = await executeQuery(
    `INSERT INTO tenants (name, api_key_hash, link_signing_secret) VALUES (?, ?, ?)`,
    [name, hashApiKey(rawApiKey), linkSigningSecret]
  );

  // rawApiKey is returned once here and never persisted — the caller (the
  // CLI setup script) is responsible for handing it to the operator.
  return { tenantId: result.insertId, rawApiKey, linkSigningSecret };
}

export async function getTenantById(tenantId) {
  const [row] = await executeQuery(`SELECT id, name, link_signing_secret FROM tenants WHERE id = ?`, [tenantId]);
  return row || null;
}

// ---- resources -----------------------------------------------------------

export async function createResource(tenantId, { slug, name, defaultDurationMin, defaultLocation, contactInfo }) {
  const result = await executeQuery(
    `INSERT INTO resources (tenant_id, slug, name, default_duration_min, default_location, contact_info)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, slug, name, defaultDurationMin || 45, defaultLocation || null, contactInfo || null]
  );
  return { id: result.insertId, tenantId, slug, name };
}

// Currently the only field an admin needs to change after creation without
// recreating the resource. Kept narrow on purpose — broaden if/when a real
// need for editing name/slug/duration shows up.
export async function updateResourceContactInfo(tenantId, resourceId, contactInfo) {
  await assertResourceOwnedByTenant(resourceId, tenantId);
  await executeQuery(`UPDATE resources SET contact_info = ? WHERE id = ?`, [contactInfo || null, resourceId]);
}

export async function getResourceBySlug(tenantId, slug) {
  const [row] = await executeQuery(
    `SELECT * FROM resources WHERE tenant_id = ? AND slug = ?`,
    [tenantId, slug]
  );
  return row || null;
}

export async function listResources(tenantId) {
  return executeQuery(`SELECT * FROM resources WHERE tenant_id = ? ORDER BY name`, [tenantId]);
}

// Ownership guard used before any mutation scoped by resourceId, so a
// tenant can never touch another tenant's slots/bookings by guessing IDs.
async function assertResourceOwnedByTenant(resourceId, tenantId) {
  const [row] = await executeQuery(
    `SELECT id FROM resources WHERE id = ? AND tenant_id = ?`,
    [resourceId, tenantId]
  );
  if (!row) {
    const err = new Error("Resource not found for this tenant");
    err.statusCode = 404;
    throw err;
  }
}

// ---- slots -----------------------------------------------------------

export async function bulkCreateSlots(tenantId, resourceId, {
  startDate, endDate, weekdays, startTime, endTime, durationMin, location,
}) {
  await assertResourceOwnedByTenant(resourceId, tenantId);

  const weekdaySet = new Set(weekdays);
  const rows = [];

  for (const date of iterateDates(startDate, endDate)) {
    if (!weekdaySet.has(weekdayOf(date))) continue;

    let cursor = startTime;
    while (true) {
      const slotEnd = addMinutesToTime(cursor, durationMin);
      if (!slotEnd || slotEnd > endTime) break;
      rows.push([resourceId, `${date} ${cursor}:00`, `${date} ${slotEnd}:00`, location || null]);
      cursor = slotEnd;
    }
  }

  if (rows.length === 0) return { created: 0 };

  // INSERT IGNORE + the slots_resource_starts_idx UNIQUE constraint (see
  // create_tables.sql) makes this safe to call again with an overlapping
  // range — e.g. a retry after a timeout, or generating two adjacent weeks
  // that share a boundary day — instead of silently duplicating slots.
  // One multi-row statement rather than a per-row INSERT loop: generating a
  // few months of slots is hundreds of rows, and INSERT IGNORE's
  // affectedRows already reports exactly how many were actually inserted
  // (duplicates skipped by the UNIQUE constraint don't count), so the
  // created/skipped split below still comes out right in a single call.
  const result = await executeQuery(
    `INSERT IGNORE INTO slots (resource_id, starts_at, ends_at, location) VALUES ?`,
    [rows]
  );
  const created = result.affectedRows;

  return { created, skipped: rows.length - created };
}

export async function listSlotsForAdmin(tenantId, resourceId, { activeOnly } = {}) {
  await assertResourceOwnedByTenant(resourceId, tenantId);
  return executeQuery(
    `SELECT s.*,
            b.id AS booking_id, b.status AS booking_status,
            b.contact_email, b.contact_phone
     FROM slots s
     LEFT JOIN bookings b ON b.slot_id = s.id AND b.status != 'cancelled'
     WHERE s.resource_id = ? ${activeOnly ? "AND s.is_active = true" : ""}
     ORDER BY s.starts_at`,
    [resourceId]
  );
}

export async function deleteSlot(tenantId, resourceId, slotId) {
  await assertResourceOwnedByTenant(resourceId, tenantId);
  const [booking] = await executeQuery(
    `SELECT id FROM bookings WHERE slot_id = ? AND status != 'cancelled'`,
    [slotId]
  );
  if (booking) {
    const err = new Error("Cannot delete a slot with an active booking — cancel the booking first");
    err.statusCode = 409;
    throw err;
  }
  await executeQuery(`DELETE FROM slots WHERE id = ? AND resource_id = ?`, [slotId, resourceId]);
}

// Public, respondent-facing slot listing: only open, unbooked, future-enough
// slots. `afterDate` is computed and passed in by the caller's backend (this
// service has no idea why 14 days matters — it just filters on a date).
export async function listAvailablePublicSlots(resourceId, afterDate) {
  return executeQuery(
    `SELECT s.id, s.starts_at, s.ends_at, s.location
     FROM slots s
     LEFT JOIN bookings b ON b.slot_id = s.id AND b.status != 'cancelled'
     WHERE s.resource_id = ?
       AND s.is_active = true
       AND s.starts_at >= ?
       AND b.id IS NULL
     ORDER BY s.starts_at`,
    [resourceId, afterDate]
  );
}

// ---- bookings -----------------------------------------------------------

async function generateUniqueManageToken(conn) {
  let token = generateToken();
  // Same generate-check-regenerate loop as the main app's assignmentHelper.js
  while (true) {
    const [rows] = await conn.query(`SELECT id FROM bookings WHERE manage_token = ?`, [token]);
    if (rows.length === 0) return token;
    token = generateToken();
  }
}

export async function createBooking({ resourceId, slotId, externalRef, email, phone, locale }) {
  const safeLocale = SUPPORTED_LOCALES.includes(locale) ? locale : "en";

  return executeTransaction(async (conn) => {
    // Lock the slot row so two concurrent reservations against the same
    // slot can't both pass the availability check.
    const [[slot]] = await conn.query(
      `SELECT id, resource_id, is_active FROM slots WHERE id = ? FOR UPDATE`,
      [slotId]
    );
    if (!slot || slot.resource_id !== resourceId || !slot.is_active) {
      const err = new Error("Slot is not available");
      err.statusCode = 409;
      throw err;
    }

    const [existingActive] = await conn.query(
      `SELECT id FROM bookings WHERE slot_id = ? AND status != 'cancelled'`,
      [slotId]
    );
    if (existingActive.length > 0) {
      const err = new Error("Slot is already booked");
      err.statusCode = 409;
      throw err;
    }

    const manageToken = await generateUniqueManageToken(conn);

    const [result] = await conn.query(
      `INSERT INTO bookings (slot_id, external_ref, contact_email, contact_phone, manage_token, locale, status)
       VALUES (?, ?, ?, ?, ?, ?, 'booked')`,
      [slotId, externalRef, email, phone, manageToken, safeLocale]
    );

    return { bookingId: result.insertId, manageToken, slotId };
  });
}

export async function getBookingByManageToken(manageToken) {
  const [row] = await executeQuery(
    `SELECT b.*, s.starts_at, s.ends_at, s.location, s.resource_id,
            r.name AS resource_name, r.slug AS resource_slug, r.default_location,
            r.contact_info, r.tenant_id
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     JOIN resources r ON r.id = s.resource_id
     WHERE b.manage_token = ?`,
    [manageToken]
  );
  return row || null;
}

export async function rescheduleBooking(manageToken, newSlotId) {
  return executeTransaction(async (conn) => {
    const [[booking]] = await conn.query(
      `SELECT b.*, s.resource_id FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.manage_token = ? FOR UPDATE`,
      [manageToken]
    );
    if (!booking || booking.status === "cancelled") {
      const err = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    const [[newSlot]] = await conn.query(`SELECT id, resource_id, is_active FROM slots WHERE id = ? FOR UPDATE`, [newSlotId]);
    if (!newSlot || newSlot.resource_id !== booking.resource_id || !newSlot.is_active) {
      const err = new Error("Slot is not available");
      err.statusCode = 409;
      throw err;
    }
    const [existingActive] = await conn.query(
      `SELECT id FROM bookings WHERE slot_id = ? AND status != 'cancelled'`,
      [newSlotId]
    );
    if (existingActive.length > 0) {
      const err = new Error("Slot is already booked");
      err.statusCode = 409;
      throw err;
    }

    await conn.query(
      `UPDATE bookings SET slot_id = ?, status = 'rescheduled', updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [newSlotId, booking.id]
    );

    return { bookingId: booking.id, previousSlotId: booking.slot_id, newSlotId };
  });
}

export async function cancelBooking(manageToken) {
  const result = await executeQuery(
    `UPDATE bookings SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE manage_token = ? AND status != 'cancelled'`,
    [manageToken]
  );
  if (result.affectedRows === 0) {
    const err = new Error("Booking not found or already cancelled");
    err.statusCode = 404;
    throw err;
  }
}

export async function listBookingsForAdmin(tenantId, { resourceId } = {}) {
  return executeQuery(
    `SELECT b.id, b.external_ref, b.contact_email, b.contact_phone, b.status,
            b.created_at, b.updated_at, s.starts_at, s.ends_at, s.location,
            r.name AS resource_name
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     JOIN resources r ON r.id = s.resource_id
     WHERE r.tenant_id = ? ${resourceId ? "AND r.id = ?" : ""}
     ORDER BY s.starts_at DESC`,
    resourceId ? [tenantId, resourceId] : [tenantId]
  );
}

export async function setBookingGoogleEventId(bookingId, googleEventId) {
  await executeQuery(`UPDATE bookings SET google_event_id = ? WHERE id = ?`, [googleEventId, bookingId]);
}

// ---- webhooks -----------------------------------------------------------

export async function registerWebhook(tenantId, url) {
  const secret = crypto.randomBytes(24).toString("hex");
  const result = await executeQuery(
    `INSERT INTO webhooks (tenant_id, url, secret) VALUES (?, ?, ?)`,
    [tenantId, url, secret]
  );
  return { id: result.insertId, url, secret };
}

export async function listWebhooks(tenantId) {
  return executeQuery(`SELECT id, url, created_at FROM webhooks WHERE tenant_id = ?`, [tenantId]);
}
