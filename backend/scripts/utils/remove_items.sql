-- Because of foreign keys, there is a problem of removing the items from specific table - there is a strict hierarchy in which order to remove....
-- NOT RECOMMENDED TO REMOVE!

-- 1. IN ORDER TO REMOVE sessions, participants, projects:
--  task_results, session_mic_checks, session_environments, recordings -> sessions
--  -> participant_protocol_contacts -> participant_protocols -> project_protocols -> user_projects -> projects
-- NOTE: follow-up booking rows (if enable_followup_booking was used) live in the
-- separate booking-service DB, keyed by participant_protocol_id as external_ref.
-- Deleting participant_protocols here does NOT remove them there — clean those up
-- separately in booking-service if needed.
START TRANSACTION;
SET @target_project_id = 999; ----CHANGE!

DELETE FROM task_results
WHERE session_id IN (
    SELECT s.id FROM sessions s
    JOIN participant_protocols pp ON s.participant_protocol_id = pp.id
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.project_id = @target_project_id
);

-- session_mic_checks and session_environments are ON DELETE CASCADE from sessions,
-- but deleted explicitly here for clarity/portability.
DELETE FROM session_mic_checks
WHERE session_id IN (
    SELECT s.id FROM sessions s
    JOIN participant_protocols pp ON s.participant_protocol_id = pp.id
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.project_id = @target_project_id
);

DELETE FROM session_environments
WHERE session_id IN (
    SELECT s.id FROM sessions s
    JOIN participant_protocols pp ON s.participant_protocol_id = pp.id
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.project_id = @target_project_id
);

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

DELETE FROM participant_protocol_contacts
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
--  task_results, session_mic_checks, session_environments, recordings -> sessions
--  -> participant_protocol_contacts -> participant_protocols -> project_protocols
--  -> protocol_tasks (-> protocol_contents, cascades automatically) -> protocols
START TRANSACTION;
SET @target_protocol_id = 999; ---- CHANGE!

DELETE FROM task_results
WHERE protocol_task_id IN (
    SELECT id FROM protocol_tasks WHERE protocol_id = @target_protocol_id
);

DELETE FROM recordings
WHERE protocol_task_id IN (
    SELECT id FROM protocol_tasks WHERE protocol_id = @target_protocol_id
);

-- session_mic_checks and session_environments are ON DELETE CASCADE from sessions,
-- but deleted explicitly here for clarity/portability.
DELETE FROM session_mic_checks
WHERE session_id IN (
    SELECT s.id FROM sessions s
    JOIN participant_protocols pp ON s.participant_protocol_id = pp.id
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.protocol_id = @target_protocol_id
);

DELETE FROM session_environments
WHERE session_id IN (
    SELECT s.id FROM sessions s
    JOIN participant_protocols pp ON s.participant_protocol_id = pp.id
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.protocol_id = @target_protocol_id
);

DELETE FROM sessions
WHERE participant_protocol_id IN (
    SELECT pp.id FROM participant_protocols pp
    JOIN project_protocols prp ON pp.project_protocol_id = prp.id
    WHERE prp.protocol_id = @target_protocol_id
);

DELETE FROM participant_protocol_contacts
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

-- 4. IN ORDER TO REMOVE a single participant_protocol (one assignment) and all its data:
--  task_results, session_mic_checks, session_environments, recordings -> sessions
--  -> participant_protocol_contacts -> participant_protocols (-> participants, optional)
-- NOTE: only DB rows are removed — recording/mic-check files at recording_url stay in storage.
-- NOTE: booking-service rows (external_ref = participant_protocol_id) are not touched.
START TRANSACTION;
SET @target_pp_id = 999; ---- CHANGE!
--OR SET @target_pp_id = (SELECT participant_protocol_id FROM sessions where id = XXX);

-- Preview what will be removed (optional):
-- SELECT
--   (SELECT COUNT(*) FROM sessions WHERE participant_protocol_id = @target_pp_id) AS sessions,
--   (SELECT COUNT(*) FROM recordings WHERE session_id IN (SELECT id FROM sessions WHERE participant_protocol_id = @target_pp_id)) AS recordings,
--   (SELECT COUNT(*) FROM task_results WHERE session_id IN (SELECT id FROM sessions WHERE participant_protocol_id = @target_pp_id)) AS task_results;

SET @target_participant_id = (SELECT participant_id FROM participant_protocols WHERE id = @target_pp_id);

DELETE FROM task_results
WHERE session_id IN (SELECT id FROM sessions WHERE participant_protocol_id = @target_pp_id);

-- session_mic_checks and session_environments are ON DELETE CASCADE from sessions,
-- but deleted explicitly here for clarity/portability.
DELETE FROM session_mic_checks
WHERE session_id IN (SELECT id FROM sessions WHERE participant_protocol_id = @target_pp_id);

DELETE FROM session_environments
WHERE session_id IN (SELECT id FROM sessions WHERE participant_protocol_id = @target_pp_id);

DELETE FROM recordings
WHERE session_id IN (SELECT id FROM sessions WHERE participant_protocol_id = @target_pp_id);

DELETE FROM sessions WHERE participant_protocol_id = @target_pp_id;

DELETE FROM participant_protocol_contacts WHERE participant_protocol_id = @target_pp_id;

DELETE FROM participant_protocols WHERE id = @target_pp_id;

-- Optional: also remove the participant, but only if they have no other assignments left.
-- DELETE FROM participants
-- WHERE id = @target_participant_id
--   AND NOT EXISTS (SELECT 1 FROM participant_protocols WHERE participant_id = @target_participant_id);

COMMIT; -- to just test it ROLLBACK
