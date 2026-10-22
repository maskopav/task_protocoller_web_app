-- scripts/schema/create_upload_tables.sql
--
-- Phase B upload management (docs/upload_management/specification.md section 5).
-- One file serves both a fresh install (runInit.js runs it right after
-- create_tables.sql) and an existing database (npm run db:uploads). Every
-- statement is IF NOT EXISTS, so it is idempotent and the two paths cannot drift.
--
-- NOTE: runSqlFile.js splits naively on semicolons -- none inside comments or strings.

-- One row per desktop-app installation. site_id is learned from the site token
-- (config fetch or upload) and is NULL until then.
CREATE TABLE IF NOT EXISTS `devices` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `installation_id` varchar(64) UNIQUE NOT NULL,
  `site_id` integer DEFAULT NULL,
  `label` varchar(255) DEFAULT NULL COMMENT 'Master-set display name',
  `app_version` varchar(32) DEFAULT NULL,
  `last_config_version` varchar(32) DEFAULT NULL,
  `last_config_at` timestamp NULL DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT NULL,
  `local_pending` integer NOT NULL DEFAULT 0 COMMENT 'Sessions waiting on the device, from check-in',
  `local_failed` integer NOT NULL DEFAULT 0 COMMENT 'Sessions failed on the device, from check-in',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL
);

-- One row per accepted session upload. The ZIP itself lives on disk at
-- DATA_PATH/storage_path and is never modified. site_id NULL means quarantine.
CREATE TABLE IF NOT EXISTS `upload_sessions` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `session_id` char(32) UNIQUE NOT NULL,
  `device_id` integer NOT NULL,
  `site_id` integer DEFAULT NULL,
  `project_id` integer DEFAULT NULL,
  `protocol_id` integer DEFAULT NULL,
  `protocol_name` varchar(100) DEFAULT NULL,
  `protocol_project` varchar(255) DEFAULT NULL,
  `config_version` varchar(32) DEFAULT NULL,
  `app_version` varchar(32) DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `ended_at` datetime(3) DEFAULT NULL,
  `processed_at` datetime(3) DEFAULT NULL,
  `received_at` datetime(3) NOT NULL,
  `duration_s` integer DEFAULT NULL,
  `bytes` bigint NOT NULL,
  `zip_sha256` char(64) NOT NULL,
  `storage_path` varchar(255) NOT NULL COMMENT 'Relative to DATA_PATH',
  `status` enum('validating','valid','invalid') NOT NULL DEFAULT 'validating',
  `invalid_reason` enum('checksum','manifest','malformed','unknown_device') DEFAULT NULL,
  `checks` JSON DEFAULT NULL,
  `qc` enum('unreviewed','ok','review','excluded') NOT NULL DEFAULT 'unreviewed',
  `flags` JSON NOT NULL DEFAULT ('[]'),
  `tasks_total` integer DEFAULT NULL,
  `tasks_done` integer DEFAULT NULL,
  `tasks_skipped` integer DEFAULT NULL,
  `audio_clips` integer DEFAULT NULL,
  `video_clips` integer DEFAULT NULL,
  `has_audio` boolean DEFAULT NULL,
  `recovered` boolean DEFAULT NULL,
  `interruptions` integer DEFAULT NULL,
  `timeline_used` enum('original','edited') DEFAULT NULL,
  `patient_code` varchar(255) DEFAULT NULL,
  `visit_number` varchar(64) DEFAULT NULL,
  `participant_fields` JSON DEFAULT NULL COMMENT 'Personal data: masked in the API, never logged',
  `participant_edited_at` timestamp NULL DEFAULT NULL,
  `exam_summary` JSON DEFAULT NULL COMMENT 'Everything the detail page needs without opening the ZIP',
  `backed_up_at` timestamp NULL DEFAULT NULL,
  FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`),
  FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`id`),
  INDEX `upload_sessions_site_received` (`site_id`, `received_at`),
  INDEX `upload_sessions_project_received` (`project_id`, `received_at`),
  INDEX `upload_sessions_status` (`status`),
  INDEX `upload_sessions_qc` (`qc`),
  INDEX `upload_sessions_patient` (`patient_code`)
);

-- Every upload request that got as far as a well-formed sessionId. No FK on
-- session_id on purpose: rejected attempts have no upload_sessions row.
CREATE TABLE IF NOT EXISTS `upload_attempts` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `session_id` char(32) NOT NULL,
  `installation_id` varchar(64) DEFAULT NULL,
  `at` datetime(3) NOT NULL,
  `http_code` smallint NOT NULL COMMENT '0 = reported by the device, no request reached the server',
  `outcome` varchar(16) NOT NULL COMMENT 'accepted, resent, checksum, conflict, quarantined, error',
  `bytes` bigint DEFAULT NULL,
  `sha_declared` char(64) DEFAULT NULL,
  `sha_computed` char(64) DEFAULT NULL,
  `device_reported` boolean NOT NULL DEFAULT false,
  INDEX `upload_attempts_session` (`session_id`)
);

CREATE TABLE IF NOT EXISTS `session_comments` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `upload_session_id` integer NOT NULL,
  `user_id` integer DEFAULT NULL,
  `text` text NOT NULL,
  `is_system` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`upload_session_id`) REFERENCES `upload_sessions` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

-- Reveals, downloads and participant edits. details may hold personal values
-- (participant edits), so this table is DB-only and never mirrored to log files.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `user_id` integer DEFAULT NULL,
  `action` enum('reveal','download','bundle','participant_edit','qc_change') NOT NULL,
  `upload_session_id` integer DEFAULT NULL,
  `details` JSON DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`upload_session_id`) REFERENCES `upload_sessions` (`id`) ON DELETE SET NULL,
  INDEX `audit_log_session` (`upload_session_id`)
);

CREATE TABLE IF NOT EXISTS `backup_runs` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `kind` enum('db','files') NOT NULL,
  `started_at` datetime(3) NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `status` enum('running','ok','failed') NOT NULL DEFAULT 'running',
  `target` varchar(255) NOT NULL COMMENT 'BackupTarget.describe(), no secrets',
  `artifact` varchar(255) DEFAULT NULL,
  `bytes` bigint DEFAULT NULL,
  `items` integer DEFAULT NULL,
  `error` text DEFAULT NULL
)
