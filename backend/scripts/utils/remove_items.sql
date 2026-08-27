-- Because of foreign keys, there is a problem of removing the items from specific table - there is a strict hierarchy in which order to remove....
-- NOT RECOMMENDED TO REMOVE!

-- 1. IN ORDER TO REMOVE projects:
--  site_projects -> project_protocols -> user_projects -> projects
START TRANSACTION;
SET @target_project_id = 999; ----CHANGE!

DELETE FROM site_projects WHERE project_id = @target_project_id;

DELETE FROM project_protocols WHERE project_id = @target_project_id;

DELETE FROM user_projects WHERE project_id = @target_project_id;

DELETE FROM projects WHERE id = @target_project_id;

COMMIT; -- to just test it ROLLBACK


-- 2. IN ORDER TO REMOVE protocols:
--  project_protocols -> protocol_tasks -> protocols
START TRANSACTION;
SET @target_protocol_id = 999; ---- CHANGE!

DELETE FROM project_protocols WHERE protocol_id = @target_protocol_id;

DELETE FROM protocol_tasks WHERE protocol_id = @target_protocol_id;

DELETE FROM protocols WHERE id = @target_protocol_id;

COMMIT;

-- 3. IN ORDER TO REMOVE users (NOT RECOMMENDED -> SET is_active = FALSE instead):
--  project reference -> protocol reference -> user_projects -> users
START TRANSACTION;
SET @target_user_id = 999; ---- CHANGE!

UPDATE projects SET created_by = NULL WHERE created_by = @target_user_id;
UPDATE projects SET updated_by = NULL WHERE updated_by = @target_user_id;

UPDATE protocols SET created_by = NULL WHERE created_by = @target_user_id;
UPDATE protocols SET updated_by = NULL WHERE updated_by = @target_user_id;

UPDATE sites SET created_by = NULL WHERE created_by = @target_user_id;
UPDATE sites SET updated_by = NULL WHERE updated_by = @target_user_id;

DELETE FROM user_projects WHERE user_id = @target_user_id;

DELETE FROM users WHERE id = @target_user_id;

COMMIT;