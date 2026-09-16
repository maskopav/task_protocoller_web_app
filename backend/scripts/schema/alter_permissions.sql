-- scripts/schema/alter_permissions.sql
--
-- Additive, idempotent upgrade for the delegated-permission work. The project
-- has no migration tool and runInit.js drops everything, so this exists to
-- bring an EXISTING database up to the new create_tables.sql without losing
-- the sites, projects and protocols already in it. A fresh install gets the
-- same columns straight from create_tables.sql and never needs this file.
--
-- Run with: npm run db:permissions
--
-- NOTE: runSqlFile.js splits naively on ";" — no semicolons inside strings or
-- comments in this file.

-- Per-assignment edit right. Defaults to 1 so every assignment that already
-- exists keeps behaving as it did: holding a project meant being able to change
-- it. A row is only ever absent for access derived through a clinic, which is
-- exactly the case that must not carry edit rights.
ALTER TABLE `user_projects`
  ADD COLUMN IF NOT EXISTS `can_edit` BOOLEAN NOT NULL DEFAULT 1
  COMMENT 'Whether this assignment carries the right to change the project and its protocols';

-- Master-granted right to create own projects. Defaults to 0: an existing admin
-- gains nothing until a master turns it on.
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `can_create_projects` BOOLEAN NOT NULL DEFAULT 0
  COMMENT 'Master-granted: may create (and archive) own projects';

-- Creating clinics used to follow from holding an editable project. It is now
-- its own master-granted right, so it can be handed out (and taken back)
-- independently of project authorship.
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `can_create_sites` BOOLEAN NOT NULL DEFAULT 0
  COMMENT 'Master-granted: may create (and archive) own sites';

-- Backfill for the switch to "access lives in the assignment tables only".
-- created_by used to grant access on its own, so anything a non-master created
-- before this change has no matching row and its creator would lose it. INSERT
-- IGNORE leans on the UNIQUE (user_id, project_id) / (user_id, site_id) indexes,
-- so re-running adds nothing. Masters are skipped -- they never hold rows here.
INSERT IGNORE INTO `user_projects` (`user_id`, `project_id`, `can_edit`)
SELECT p.created_by, p.id, 1
FROM `projects` p
JOIN `users` u ON u.id = p.created_by
JOIN `roles` r ON r.id = u.role_id
WHERE r.name <> 'master';

INSERT IGNORE INTO `user_sites` (`user_id`, `site_id`)
SELECT s.created_by, s.id
FROM `sites` s
JOIN `users` u ON u.id = s.created_by
JOIN `roles` r ON r.id = u.role_id
WHERE r.name <> 'master';

-- Per-(user, project) clinic whitelist. Separate from user_sites on purpose:
-- "you have this clinic" and "you are narrowed to these" are different claims,
-- and keeping them in one table is what made the earlier scoping contradict
-- itself. No rows for a (user, project) pair means "all of that project's
-- clinics", resolved live, so a clinic added later shows up on its own.
CREATE TABLE IF NOT EXISTS `user_project_sites` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `user_id` integer NOT NULL,
  `project_id` integer NOT NULL,
  `site_id` integer NOT NULL,
  CONSTRAINT `user_project_sites_index` UNIQUE (`user_id`, `project_id`, `site_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
);
