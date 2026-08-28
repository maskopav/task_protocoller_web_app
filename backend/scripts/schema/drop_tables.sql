SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `user_sites`;
DROP TABLE IF EXISTS `site_projects`;
DROP TABLE IF EXISTS `sites`;
DROP TABLE IF EXISTS `project_protocols`;
DROP TABLE IF EXISTS `protocol_contents`;
DROP TABLE IF EXISTS `protocol_tasks`;
DROP TABLE IF EXISTS `protocols`;
DROP TABLE IF EXISTS `user_projects`;
DROP TABLE IF EXISTS `projects`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `task_types`;
DROP TABLE IF EXISTS `languages`;
DROP TABLE IF EXISTS `roles`;

-- Tables removed in the `newshare` branch are dropped too
DROP TABLE IF EXISTS `task_results`;
DROP TABLE IF EXISTS `session_mic_checks`;
DROP TABLE IF EXISTS `recordings`;
DROP TABLE IF EXISTS `session_environments`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `participant_protocols`;
DROP TABLE IF EXISTS `participants`;

-- create_views.sql uses CREATE OR REPLACE, so views deleted from that script
-- would otherwise linger broken on existing databases.
DROP VIEW IF EXISTS `v_participant_protocols`;
DROP VIEW IF EXISTS `v_quest_results`;
DROP VIEW IF EXISTS `v_session_progress_detailed`;
DROP VIEW IF EXISTS `v_session_summary`;
DROP VIEW IF EXISTS `v_site_protocols`;

SET FOREIGN_KEY_CHECKS = 1;