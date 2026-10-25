CREATE TABLE `roles` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) UNIQUE NOT NULL COMMENT 'master, admin',
  `description` text
);

CREATE TABLE `users` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `email` varchar(255) UNIQUE NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(255),
  `role_id` integer NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `is_active` boolean NOT NULL DEFAULT true,
  `must_change_password` boolean NOT NULL DEFAULT true,
  `reset_password_token` varchar(255) DEFAULT NULL COMMENT 'sha256 hex of the emailed token, never the token itself',
  `reset_password_expires` TIMESTAMP DEFAULT NULL,
  `can_create_projects` BOOLEAN NOT NULL DEFAULT 0 COMMENT 'Master-granted: may create (and archive) own projects',
  `can_create_sites` BOOLEAN NOT NULL DEFAULT 0 COMMENT 'Master-granted: may create (and archive) own sites',
  `token_version` integer NOT NULL DEFAULT 0 COMMENT 'Bumped on every password change, JWTs carrying an older value are rejected'
); 

-- Who may change a study and its protocols. Seeing a study is a different claim
-- and comes from user_sites (studies running at your clinics) or from this table.
CREATE TABLE `project_editors` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `user_id` integer NOT NULL,
  `project_id` integer NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `projects` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) UNIQUE NOT NULL,
  `description` text,
  `start_date` date NOT NULL,
  `end_date` date,
  `is_active` boolean NOT NULL DEFAULT true,
  `countries` varchar(255) COMMENT 'Comma-separated country list, free text',
  `contact_persons` varchar(255) COMMENT 'Comma-separated names, free text',
  `contact_emails` varchar(512) COMMENT 'Comma-separated emails, validated per entry in the controller',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` integer,
  `updated_at` timestamp,
  `updated_by` integer
);

CREATE TABLE `protocols` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `protocol_group_id` integer NOT NULL,
  `name` varchar(100) NOT NULL,
  `language_id` integer NOT NULL,
  `description` text,
  `version` integer NOT NULL DEFAULT 1,
  `is_current` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` integer,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_by` integer,
  `randomization` JSON DEFAULT NULL COMMENT 'Stores { strategy: "global"|"module"|"none", moduleSettings: {...} }',
  `use_audio_guide` BOOLEAN NOT NULL DEFAULT false,
  `required_identifiers` JSON DEFAULT NULL COMMENT 'Array of identifier objects {name, catalogue, label, help, placeholder, regex, required} (legacy: array of string ids)',
  `recordings_file_name` varchar(255) DEFAULT NULL COMMENT 'Desktop-app clip filename template, must contain ${taskIndex}',
  `instructions_pdf_url` varchar(512) DEFAULT NULL,
  `is_archived` BOOLEAN NOT NULL DEFAULT false,
  `project_id` integer DEFAULT NULL COMMENT 'The study this protocol belongs to. NULL only for protocol library entries',
  `copied_from_id` integer DEFAULT NULL COMMENT 'Study copy: the library version it came from. Library entry: the study protocol it was shared from'
);

CREATE TABLE `protocol_tasks` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `protocol_id` integer NOT NULL,
  `task_id` integer NOT NULL,
  `task_order` integer NOT NULL,
  `params` JSON COMMENT 'Admin-defined overrides for duration, topic, phoneme, etc. vs each param as new column??'
);

CREATE TABLE `protocol_contents` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `protocol_id` integer NOT NULL,
  `protocol_task_id` integer DEFAULT NULL, -- NULL for global, ID for specific task
  `content_type` varchar(50) NOT NULL,    -- 'info', 'consent', 'instruction', etc.
  `text_html` LONGTEXT NOT NULL,
  FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`protocol_task_id`) REFERENCES `protocol_tasks` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_task_content` (`protocol_id`, `protocol_task_id`, `content_type`)
);

CREATE TABLE `tasks` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `category` varchar(50) UNIQUE NOT NULL COMMENT 'e.g. monologue, reading, phonation',
  `type_id` integer NOT NULL COMMENT 'id of voice, visual, cognitive, questionnaire',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `task_types` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `type` varchar(255) UNIQUE COMMENT 'voice, visual, cognitive, questionnaire',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `languages` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `code` varchar(10) UNIQUE NOT NULL COMMENT 'e.g. en, cs, de',
  `name` varchar(255) NOT NULL,
  `native_name` varchar(255)
);

CREATE TABLE `sites` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) UNIQUE NOT NULL,
  `description` text,
  `country` varchar(255),
  `contact_persons` varchar(255) COMMENT 'Comma-separated names, free text',
  `contact_emails` varchar(512) COMMENT 'Comma-separated emails, validated per entry in the controller',
  `access_token` char(64) UNIQUE NOT NULL COMMENT 'Site credential stored in the external app and sent with the config request. Admin-editable free text, 16-64 chars of A-Za-z0-9_-',
  `config_json` JSON DEFAULT NULL COMMENT 'Free-form site-level config echoed back in the config JSON',
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` integer,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_by` integer
);

CREATE TABLE `site_projects` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `site_id` integer NOT NULL,
  `project_id` integer NOT NULL,
  `assigned_at` timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_sites` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `user_id` integer NOT NULL,
  `site_id` integer NOT NULL,
  `assigned_at` timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX `project_editors_index` ON `project_editors` (`user_id`, `project_id`);

CREATE UNIQUE INDEX `protocols_index_1` ON `protocols` (`protocol_group_id`, `version`, `language_id`);

CREATE UNIQUE INDEX `protocols_index_2` ON `protocols` (`project_id`, `name`, `version`, `language_id`);

CREATE INDEX `protocols_project_index` ON `protocols` (`project_id`);

CREATE UNIQUE INDEX `protocol_tasks_index_4` ON `protocol_tasks` (`protocol_id`, `task_order`);

CREATE UNIQUE INDEX `site_projects_index` ON `site_projects` (`site_id`, `project_id`);

CREATE UNIQUE INDEX `user_sites_index` ON `user_sites` (`user_id`, `site_id`);

ALTER TABLE `users` ADD FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

ALTER TABLE `project_editors` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `project_editors` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE;

ALTER TABLE `projects` ADD FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

ALTER TABLE `projects` ADD FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `protocols` ADD FOREIGN KEY (`language_id`) REFERENCES `languages` (`id`);

ALTER TABLE `protocols` ADD FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

ALTER TABLE `protocols` ADD FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `protocols` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);

ALTER TABLE `protocols` ADD FOREIGN KEY (`copied_from_id`) REFERENCES `protocols` (`id`) ON DELETE SET NULL;

ALTER TABLE `protocol_tasks` ADD FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`id`);

ALTER TABLE `protocol_tasks` ADD FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`);

ALTER TABLE `tasks` ADD FOREIGN KEY (`type_id`) REFERENCES `task_types` (`id`);

ALTER TABLE `sites` ADD FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

ALTER TABLE `sites` ADD FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `site_projects` ADD FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE;

ALTER TABLE `site_projects` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_sites` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_sites` ADD FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE;
