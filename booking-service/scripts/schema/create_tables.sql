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
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`)
);

CREATE TABLE `bookings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `slot_id` integer NOT NULL,
  `external_ref` varchar(255) NOT NULL COMMENT 'opaque ID supplied by the calling app for correlation — no FK, this service does not know what it refers to',
  `contact_email` varchar(255) NOT NULL,
  `contact_phone` varchar(255) NOT NULL,
  `manage_token` char(32) UNIQUE NOT NULL,
  `status` ENUM('booked','rescheduled','cancelled') NOT NULL DEFAULT 'booked',
  `google_event_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `active_slot_id` integer GENERATED ALWAYS AS (CASE WHEN `status` = 'cancelled' THEN NULL ELSE `slot_id` END) STORED
    COMMENT 'partial-unique-index trick: MySQL has no filtered unique index, so a generated column that is NULL for cancelled rows lets the UNIQUE KEY below enforce "at most one active booking per slot" (capacity is always 1 for now) while still allowing a slot to be rebooked after a cancellation',
  UNIQUE KEY `bookings_active_slot` (`active_slot_id`),
  FOREIGN KEY (`slot_id`) REFERENCES `slots` (`id`)
);

CREATE TABLE `webhooks` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `tenant_id` integer NOT NULL,
  `url` varchar(500) NOT NULL,
  `secret` varchar(255) NOT NULL COMMENT 'HMAC-signs the outgoing payload so the receiver can verify origin',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);

CREATE INDEX `slots_resource_starts_idx` ON `slots` (`resource_id`, `starts_at`);
CREATE INDEX `bookings_external_ref_idx` ON `bookings` (`external_ref`);
