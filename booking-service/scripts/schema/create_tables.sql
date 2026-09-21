CREATE TABLE `tenants` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `api_key_hash` varchar(255) NOT NULL COMMENT 'sha256 hex of the raw API key — raw key is shown to the operator once, at creation time only',
  `link_signing_secret` varchar(255) NOT NULL COMMENT 'HMAC key for signing/verifying public booking links',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `resources` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `tenant_id` integer NOT NULL,
  `slug` varchar(100) NOT NULL COMMENT 'used in the hosted booking page URL, e.g. /book/standardized-room-retest',
  `name` varchar(255) NOT NULL,
  `default_duration_min` integer NOT NULL DEFAULT 45,
  `default_location` varchar(255) DEFAULT NULL,
  `contact_info` text DEFAULT NULL COMMENT 'Free-text contact line (email/phone/etc.) shown to respondents when there is no slot to point them at, e.g. in the cancellation email',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `resources_tenant_slug` (`tenant_id`, `slug`)
    COMMENT 'Backstop for ensureFollowupBookingResource''s list-then-create-if-missing race: under a multi-process/clustered deployment, two processes could both see an empty list and both try to create the same resource. INSERT would then fail for the loser instead of silently duplicating the row.',
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);

CREATE TABLE `slots` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `resource_id` integer NOT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `location` varchar(255) DEFAULT NULL COMMENT 'overrides resources.default_location when set',
  `capacity` integer NOT NULL DEFAULT 1,
  `is_active` boolean NOT NULL DEFAULT true,
  `google_event_id` varchar(255) DEFAULT NULL COMMENT 'The event represents the physical time slot, not any one booking of it -- it persists across book/cancel/rebook cycles, flipping between "available" and "booked" styling rather than being recreated. See googleCalendarService.js.',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`)
);

-- One row per respondent's engagement with a resource — either a real
-- booking (slot_id set) or an open request (slot_id NULL, status
-- 'requested') from someone who reported that none of the offered slots
-- worked. 
CREATE TABLE `bookings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `resource_id` integer NOT NULL COMMENT 'always set (also reachable via slot_id -> slots.resource_id once a slot is chosen) -- needed directly since slot_id is NULL for status=requested',
  `slot_id` integer DEFAULT NULL COMMENT 'NULL only for status=requested, where the respondent left contact info + preferred_times instead of picking a slot',
  `external_ref` varchar(255) NOT NULL COMMENT 'opaque ID supplied by the calling app for correlation — no FK, this service does not know what it refers to',
  `eligible_after` date NOT NULL COMMENT 'the "after" date from the signed booking link active when this row was created (calling app''s completed_at + BOOKING_ELIGIBILITY_DAYS). Persisted here — not just checked once — so reschedule, cancel-then-rebook, and a status=requested row''s durable link (see manage_token) can all re-enforce the same floor without this service needing to call back to the calling app, which it has no way to do (external_ref is opaque to it)',
  `contact_email` varchar(255) NOT NULL,
  `contact_phone` varchar(255) NOT NULL,
  `preferred_times` text DEFAULT NULL COMMENT 'set only for status=requested -- free-text note on when the respondent would be available, since none of the offered slots worked',
  `manage_token` char(32) UNIQUE NOT NULL COMMENT 'durable personal link credential either way — for a real booking it unlocks reschedule/cancel; for status=requested it only ever redirects back into slot-picking, never reschedule/cancel (see publicController.js)',
  `locale` varchar(10) NOT NULL DEFAULT 'en' COMMENT 'Language for this row''s emails, chosen once at creation time — see src/i18n/emailTranslations.js',
  `status` ENUM('requested','booked','rescheduled','cancelled') NOT NULL DEFAULT 'booked',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `active_slot_id` integer GENERATED ALWAYS AS (CASE WHEN `status` = 'cancelled' THEN NULL ELSE `slot_id` END) STORED
    COMMENT 'partial-unique-index trick: MySQL has no filtered unique index, so a generated column that is NULL for cancelled rows lets the UNIQUE KEY below enforce "at most one active booking per slot" (capacity is always 1 for now) while still allowing a slot to be rebooked after a cancellation. Always NULL for status=requested too, since slot_id itself is already NULL there',
  UNIQUE KEY `bookings_active_slot` (`active_slot_id`),
  FOREIGN KEY (`slot_id`) REFERENCES `slots` (`id`),
  FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`)
);

CREATE TABLE `webhooks` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `tenant_id` integer NOT NULL,
  `url` varchar(500) NOT NULL,
  `secret` varchar(255) NOT NULL COMMENT 'HMAC-signs the outgoing payload so the receiver can verify origin',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);

-- UNIQUE, not just an index: makes bulkCreateSlots's INSERT IGNORE safe to
-- call again over an overlapping range (retry after a timeout, adjacent
-- date ranges sharing a boundary day) instead of silently duplicating slots.
CREATE UNIQUE INDEX `slots_resource_starts_idx` ON `slots` (`resource_id`, `starts_at`);
CREATE INDEX `bookings_external_ref_idx` ON `bookings` (`external_ref`);
