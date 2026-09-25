-- Adds the "smell" task type + "smell" task category to an already-provisioned
-- database. seed_all.sql only seeds these on a fresh install, so any existing
-- database needs this run once. Safe to re-run (INSERT IGNORE skips rows that
-- already exist, since both `task_types.type` and `tasks.category` are UNIQUE).

INSERT IGNORE INTO `task_types` (`type`) VALUES ('smell');

INSERT IGNORE INTO `tasks` (`category`, `type_id`)
VALUES ('smell', (SELECT id FROM `task_types` WHERE `type` = 'smell'));
