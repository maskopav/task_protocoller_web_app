-- Switches every created_at DEFAULT from CURRENT_TIMESTAMP to
-- UTC_TIMESTAMP() on an already-provisioned booking-service database, to
-- match scripts/schema/create_tables.sql.
--
-- Why: the DB session runs in the server's local zone, so CURRENT_TIMESTAMP
-- writes local time, while updated_at is written with UTC_TIMESTAMP(). The
-- service now sets created_at explicitly anyway (see
-- src/db/utcTimestamps.test.js); this makes the column defaults agree too.
-- slots.starts_at/ends_at are untouched -- they are local wall-clock time
-- by design and have no default.
--
-- Schema only -- NO existing rows are changed. Safe to re-run.
-- Run it against the database the booking tables live in
-- (BOOKING_DB_NAME, or DB_NAME when this service runs standalone).
--
-- Requires MariaDB >= 10.2.1 or MySQL >= 8.0.13 (expression defaults).

ALTER TABLE `tenants`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `resources`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `slots`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `bookings`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `webhooks`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());
