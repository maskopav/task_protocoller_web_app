-- Switches every timestamp column's DEFAULT from CURRENT_TIMESTAMP to
-- UTC_TIMESTAMP() on an already-provisioned database, to match
-- scripts/schema/create_tables.sql.
--
-- Why: the DB session runs in the server's local zone (SYSTEM =
-- Europe/Prague), so CURRENT_TIMESTAMP writes local time while the app
-- writes UTC_TIMESTAMP() everywhere else. The app now sets these columns
-- explicitly anyway (see src/db/utcTimestamps.test.js); this makes the
-- column defaults agree too, so a manual INSERT or a future code path that
-- forgets the column still gets UTC.
--
-- Schema only -- NO existing rows are changed. Rows saved before this ran
-- keep whatever time they were saved with.
--
-- Safe to re-run (MODIFY just re-applies the same definition). Each MODIFY
-- repeats the column's full definition from create_tables.sql, with NULL /
-- NOT NULL spelled out so the result doesn't depend on the server's
-- explicit_defaults_for_timestamp setting.
--
-- Requires MariaDB >= 10.2.1 or MySQL >= 8.0.13 (expression defaults).
-- Before running against production, check the live schema hasn't drifted
-- from create_tables.sql:  node scripts/schema/compareSchemas.js .env .env.production
--
-- Booking-service tables have their own script:
-- booking-service/scripts/utils/utc_timestamp_defaults.sql

ALTER TABLE `users`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP()),
  MODIFY `updated_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `user_projects`
  MODIFY `assigned_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `projects`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `protocols`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP()),
  MODIFY `updated_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `tasks`
  MODIFY `updated_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `task_types`
  MODIFY `updated_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `participants`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `participant_protocols`
  MODIFY `start_date` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `participant_protocol_contacts`
  MODIFY `imported_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP()) COMMENT 'When this row was recorded via the Fieldwork CSV import';

ALTER TABLE `sessions`
  MODIFY `session_date` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP()),
  MODIFY `last_activity_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `session_environments`
  MODIFY `created_at` timestamp NOT NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `recordings`
  MODIFY `created_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `session_mic_checks`
  MODIFY `created_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());

ALTER TABLE `task_results`
  MODIFY `created_at` timestamp NULL DEFAULT (UTC_TIMESTAMP());
