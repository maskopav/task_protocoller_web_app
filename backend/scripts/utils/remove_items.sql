-- Because of foreign keys, there is a problem of removing the items from specific table - there is a strict hierarchy in which order to remove....
-- NOT RECOMMENDED TO REMOVE!

-- 1. IN ORDER TO REMOVE sessions, participants, projects:
--  recordings -> sessions -> participant_protocols -> project_protocols -> user_projects -> projects
START TRANSACTION;
SET @target_project_id = 999; ----CHANGE!

DELETE FROM recordings 
WHERE session_id IN (
    SELECT s.id FROM sessions s
    JOIN participant_protocols pp ON s.participant_protocol_id = pp.id
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.project_id = @target_project_id
);

DELETE FROM sessions 
WHERE participant_protocol_id IN (
    SELECT pp.id FROM participant_protocols pp
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.project_id = @target_project_id
);

DELETE FROM participant_protocols 
WHERE project_protocol_id IN (
    SELECT id FROM project_protocols WHERE project_id = @target_project_id
);

DELETE FROM project_protocols WHERE project_id = @target_project_id;

DELETE FROM user_projects WHERE project_id = @target_project_id;

DELETE FROM projects WHERE id = @target_project_id;

COMMIT; -- to just test it ROLLBACK


-- 2. IN ORDER TO REMOVE protocols:
--  recordings -> sessions -> participant_protocols -> project_protocols -> protocol_tasks -> protocols
START TRANSACTION;
SET @target_protocol_id = 999; ---- CHANGE!

DELETE FROM recordings 
WHERE protocol_task_id IN (
    SELECT id FROM protocol_tasks WHERE protocol_id = @target_protocol_id
);

DELETE FROM sessions 
WHERE participant_protocol_id IN (
    SELECT pp.id FROM participant_protocols pp
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.protocol_id = @target_protocol_id
);

DELETE FROM participant_protocols 
WHERE project_protocol_id IN (
    SELECT id FROM project_protocols WHERE protocol_id = @target_protocol_id
);

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

DELETE FROM user_projects WHERE user_id = @target_user_id;

DELETE FROM users WHERE id = @target_user_id;

COMMIT;
