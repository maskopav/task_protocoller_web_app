-- Adds the "contactConsent" questionnaire category to an already-provisioned
-- database. seed_all.sql only seeds it on a fresh install, so any existing
-- database needs this run once (then `npm run db:views` for the Fieldwork
-- view's Contact Consent column). Safe to re-run (INSERT IGNORE skips the row
-- if it already exists, since `tasks.category` is UNIQUE).

INSERT IGNORE INTO `tasks` (`category`, `type_id`)
VALUES ('contactConsent', (SELECT id FROM `task_types` WHERE `type` = 'questionnaire'));
