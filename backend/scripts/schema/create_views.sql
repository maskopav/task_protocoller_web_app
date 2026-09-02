CREATE OR REPLACE VIEW v_participant_protocols AS
SELECT
    pp.id                            AS participant_protocol_id,
    pp.access_token,
    pp.start_date,
    pp.end_date,
    pp.is_active,

    -- participant
    p.id                             AS participant_id,
    p.external_id,
    p.full_name,
    p.birth_date,
    p.sex,
    COALESCE(p.contact_email,p.login_email) AS contact_email,
    p.contact_phone,
    p.notes,

    -- project
    pr.id                            AS project_id,
    pr.name                          AS project_name,
    pr.frequency                     AS project_frequency,
    pr.is_active                     AS project_is_active,

    -- project_protocols
    ppr.id                           AS project_protocol_id,

    -- protocol
    proto.id                         AS protocol_id,
    proto.name                       AS protocol_name,
    proto.version                    AS protocol_version,
    proto.is_current                 AS is_current_protocol,
    proto.language_id,

    -- Aggregated Counts
    COALESCE(agg.n_tasks, 0)         AS n_tasks,
    COALESCE(agg.n_quest, 0)         AS n_quest

FROM participant_protocols pp
JOIN participants p
    ON p.id = pp.participant_id

JOIN project_protocols ppr
    ON ppr.id = pp.project_protocol_id

JOIN projects pr
    ON pr.id = ppr.project_id

JOIN protocols proto
    ON proto.id = ppr.protocol_id

LEFT JOIN (
    SELECT 
        pt.protocol_id, 
        SUM(IF(t.category != 'questionnaire', 1, 0)) AS n_tasks,
        SUM(IF(t.category = 'questionnaire', 1, 0)) AS n_quest
    FROM protocol_tasks pt 
    JOIN tasks t ON pt.task_id = t.id 
    GROUP BY pt.protocol_id
) agg ON agg.protocol_id = proto.id
WHERE pp.access_token IS NOT NULL;


CREATE OR REPLACE VIEW v_project_protocols AS
SELECT 
    p.id,
    p.protocol_group_id,
    p.name,
    p.language_id,
    p.description,
    p.version,
    p.is_current,
    p.created_at,
    p.created_by,
    p.updated_at,
    p.updated_by,
    -- Join Data
    pp.project_id,
    pp.access_token,
    pr.name AS project_name,
    pr.end_date AS project_end_date,
    -- Aggregated Counts (Default to 0 if NULL)
    COALESCE(agg.n_tasks, 0) AS n_tasks,
    COALESCE(agg.n_quest, 0) AS n_quest
FROM protocols p
JOIN project_protocols pp ON p.id = pp.protocol_id
JOIN projects pr ON pp.project_id = pr.id
-- Efficient Aggregation Join
LEFT JOIN (
    SELECT 
        pt.protocol_id, 
        SUM(IF(t.category != 'questionnaire', 1, 0)) AS n_tasks,
        SUM(IF(t.category = 'questionnaire', 1, 0)) AS n_quest
    FROM protocol_tasks pt 
    JOIN tasks t ON pt.task_id = t.id 
    GROUP BY pt.protocol_id
) agg ON agg.protocol_id = p.id;



-- Aggregates high-level statistics for projects based on protocol assignments.
CREATE OR REPLACE VIEW v_project_summary_stats AS
SELECT 
    p.id AS project_id,
    p.name AS project_name,
    p.description,
    p.start_date,
    p.is_active AS project_is_active,
    p.country,
    p.frequency,
    p.contact_person,

    -- 1. PROTOCOL DEFINITIONS (From v_project_protocols)
    -- Counts how many DISTINCT protocols are currently marked as 'is_current = 1'
    -- This comes from the definition table, so it counts them even if no one is assigned yet.
    COALESCE(proto_stats.count_current_defined, 0) AS count_current_protocols_defined,

    -- 2. PARTICIPANT VOLUME (From v_participant_protocols)
    -- Total distinct human beings in the project
    COALESCE(part_stats.total_participants, 0) AS total_participants,
    
    -- Total assignments (links between humans and protocols)
    COALESCE(part_stats.total_assignments, 0) AS total_assignments,

    -- 3. PARTICIPANT STATUS (From v_participant_protocols)
    -- PENDING: Assigned but not started (Inactive, no end date)
    COALESCE(part_stats.count_pending, 0) AS count_pending_assignments,

    -- ACTIVE: Currently provisioned (Active flag is 1)
    COALESCE(part_stats.count_active, 0) AS count_active_assignments,

    -- FINISHED: Done (Inactive, has end date)
    COALESCE(part_stats.count_finished, 0) AS count_finished_assignments,

    -- 4. VERSION HEALTH / MAINTENANCE
    -- HEALTHY: Active users running the LATEST protocol version
    COALESCE(part_stats.count_version_current, 0) AS count_users_on_current_version,
    
    -- LEGACY WARNING: Active users running an OUTDATED protocol version
    COALESCE(part_stats.count_version_legacy, 0) AS count_users_on_legacy_version

FROM 
    projects p
-- JOIN 1: Get Protocol Counts (The Definitions)
LEFT JOIN (
    SELECT 
        project_id,
        -- Counts distinct protocol IDs where is_current = 1
        COUNT(DISTINCT IF(is_current = 1, id, NULL)) AS count_current_defined
    FROM 
        v_project_protocols
    GROUP BY 
        project_id
) proto_stats ON p.id = proto_stats.project_id
-- JOIN 2: Get Participant Stats (The Usage)
LEFT JOIN (
    SELECT 
        project_id,
        
        -- Volume
        COUNT(DISTINCT participant_id) AS total_participants,
        COUNT(participant_protocol_id) AS total_assignments,
        
        -- Status Logic
        SUM(CASE 
            WHEN (is_active = 0 OR is_active IS NULL) AND end_date IS NULL THEN 1 
            ELSE 0 
        END) AS count_pending,
        
        SUM(CASE 
            WHEN is_active = 1 THEN 1 
            ELSE 0 
        END) AS count_active,
        
        SUM(CASE 
            WHEN (is_active = 0 OR is_active IS NULL) AND end_date IS NOT NULL THEN 1 
            ELSE 0 
        END) AS count_finished,
        
        -- Version Logic
        SUM(CASE 
            WHEN is_active = 1 AND is_current_protocol = 1 THEN 1 
            ELSE 0 
        END) AS count_version_current,
        
        SUM(CASE 
            WHEN is_active = 1 AND (is_current_protocol = 0 OR is_current_protocol IS NULL) THEN 1 
            ELSE 0 
        END) AS count_version_legacy

    FROM 
        v_participant_protocols
    GROUP BY 
        project_id
) part_stats ON p.id = part_stats.project_id;

-- View for the main User Table
CREATE OR REPLACE VIEW v_users_management AS
SELECT 
    u.id as user_id, 
    u.email as user_email, 
    u.full_name, 
    r.name as role, 
    u.is_active
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.name != 'master'
ORDER BY u.id;

-- View for the User-Project Assignments Table
CREATE OR REPLACE VIEW v_user_project_assignments AS
SELECT 
    up.id as assignment_id,
    up.user_id,
    u.full_name as user_name,
    u.email as user_email, -- Added email
    p.id as project_id,
    p.name as project_name,
    up.assigned_at
FROM user_projects up
JOIN users u ON up.user_id = u.id
JOIN projects p ON up.project_id = p.id
JOIN roles r ON u.role_id = r.id
WHERE r.name != 'master'
ORDER BY up.user_id, p.name;

-- Questionnaires views
CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_quest_definitions AS
WITH RECURSIVE seq AS (
    -- Start with the first question (index 0)
    SELECT 
        id as protocol_task_id,
        params,
        0 AS n
    FROM protocol_tasks
    WHERE JSON_LENGTH(params, '$.questions') > 0
    
    UNION ALL
    
    -- Increment the index for each subsequent question
    SELECT 
        protocol_task_id,
        params,
        n + 1
    FROM seq
    WHERE n + 1 < JSON_LENGTH(params, '$.questions')
)
SELECT 
    protocol_task_id,
    -- Extract Questionnaire Metadata
    JSON_VALUE(params, '$.title') AS quest_name,
    JSON_VALUE(params, '$.description') AS quest_description,
    
    -- Extract specific Question Details using the index 'n'
    JSON_VALUE(params, CONCAT('$.questions[', n, '].id')) AS q_id,
    JSON_VALUE(params, CONCAT('$.questions[', n, '].text')) AS q_text,
    JSON_VALUE(params, CONCAT('$.questions[', n, '].type')) AS q_type
FROM seq;

CREATE OR REPLACE VIEW v_quest_results AS
SELECT 
    tr.session_id,
    tr.protocol_task_id,
    tr.repeat_index,
    def.quest_name,
    def.q_text,
    -- Extract the answer using the ID from our CTE view against the new 'payload' column
    JSON_VALUE(tr.payload, CONCAT('$."', def.q_id, '"')) AS participant_answer,
    tr.created_at
FROM task_results tr
JOIN v_quest_definitions def ON tr.protocol_task_id = def.protocol_task_id;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_session_progress_detailed AS
WITH RECURSIVE seq AS (
    -- 1. Flatten the JSON progress array
    SELECT 
        id AS session_id,
        participant_protocol_id,
        progress,
        0 AS n
    FROM sessions
    WHERE JSON_LENGTH(progress) > 0
    
    UNION ALL
    
    SELECT 
        session_id,
        participant_protocol_id,
        progress,
        n + 1
    FROM seq
    WHERE n + 1 < JSON_LENGTH(progress)
),
flattened_data AS (
    -- 2. Extract fields and convert timestamps
    SELECT 
        s.session_id,
        s.participant_protocol_id,
        CAST(REPLACE(REPLACE(JSON_VALUE(s.progress, CONCAT('$[', s.n, '].timestamp')), 'T', ' '), 'Z', '') AS DATETIME(3)) AS event_time,
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].action')) AS action,
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].taskIndex')) AS task_sequence,
        
        -- Extract the ID and the Task Name directly from JSON
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].protocolTaskId')) AS protocol_task_id,
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].taskName')) AS task_name,
        
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].questionId')) AS question_id,
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].value')) AS interaction_value
    FROM seq s
)
SELECT 
    fd.session_id,
    vpp.participant_id,
    vpp.full_name AS participant_name,
    vpp.project_name,
    fd.event_time,
    -- Seconds since the previous event in this session
    TIMESTAMPDIFF(SECOND, 
        LAG(fd.event_time) OVER (PARTITION BY fd.session_id ORDER BY fd.event_time), 
        fd.event_time
    ) AS seconds_from_prev_event,

    fd.action,
    fd.task_sequence,
    fd.protocol_task_id,
    
    -- Display Name: If it's a real task, grab category from DB. If not, use taskName from JSON.
    COALESCE(t.category, fd.task_name) AS task_category_or_name,
    
    fd.question_id,
    fd.interaction_value
FROM flattened_data fd
JOIN v_participant_protocols vpp ON fd.participant_protocol_id = vpp.participant_protocol_id
LEFT JOIN protocol_tasks pt ON fd.protocol_task_id = pt.id
LEFT JOIN tasks t ON pt.task_id = t.id
ORDER BY fd.session_id, fd.event_time;


CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_session_summary AS
SELECT
    s.id AS session_id,
    pp.id AS participant_protocol_id,
    vpp.project_id,
    vpp.participant_id,

    -- Participant Identifier
    COALESCE(
        NULLIF(part.external_id, ''),
        CONCAT_WS(', ', part.full_name, part.birth_date, part.sex)
    ) AS participant_name,

    vpp.project_name,
    vpp.protocol_name,

    -- 1. Language Information
    lang.name AS protocol_language,
    lang.code AS protocol_language_code,

    -- 2. Timestamps
    CAST(REPLACE(REPLACE(JSON_VALUE(s.progress, '$[0].timestamp'), 'T', ' '), 'Z', '') AS DATETIME(3)) AS session_started_at,
    s.last_activity_at AS session_last_activity_at,

    -- Outreach touchpoints logged by the survey agency via the Fieldwork CSV
    -- import: when the link was sent (distinct from `start_date`, when the
    -- link/token was created), and up to 3 follow-up calls with notes.
    -- Pivoted out of participant_protocol_contacts by the `contacts` join
    -- below — NULL until an agency uploads it.
    contacts.link_sent_at,
    contacts.call_1_at,
    contacts.call_1_notes,
    contacts.call_2_at,
    contacts.call_2_notes,
    contacts.call_3_at,
    contacts.call_3_notes,

    -- 3. Total Duration
    TIMESTAMPDIFF(
        SECOND,
        CAST(REPLACE(REPLACE(JSON_VALUE(s.progress, '$[0].timestamp'), 'T', ' '), 'Z', '') AS DATETIME(3)),
        s.last_activity_at
    ) AS total_duration_seconds,

    -- 4. JSON Flags
    IF(s.progress LIKE '%"resumed"%', TRUE, FALSE) AS was_resumed,
    IF(s.progress LIKE '%"language_switched"%', TRUE, FALSE) AS language_switched,

    -- 5. Participant lifecycle status shown in the admin Fieldwork table:
    --      created     -> assigned, participant never opened the protocol (no session row)
    --      in_progress -> started, can still resume within the return window
    --      incomplete  -> started, window expired -> would restart from the beginning
    --      finished    -> completed successfully
    -- SESSION_RESUME_WINDOW_HOURS: the "72" below is kept in sync with the
    -- canonical constant in backend/src/config/constants.js by any DB
    -- init/migration script (see syncViewConstants.js) — change the constant,
    -- not this literal, then re-run `npm run db:views`.
    CASE
        WHEN s.id IS NULL THEN 'created'
        WHEN s.completed = 1 THEN 'finished'
        WHEN s.last_activity_at >= (UTC_TIMESTAMP() - INTERVAL 72 HOUR) THEN 'in_progress'
        ELSE 'incomplete'
    END AS protocol_status,

    s.completed AS is_finished_flag,

    -- 6. Current Task Name
    -- If completed, return NULL. Otherwise, get DB category OR fallback to the JSON taskName of the last event.
    IF(s.id IS NULL OR s.completed = 1, NULL,
        COALESCE(
            t.category,
            JSON_VALUE(s.progress, CONCAT('$[', JSON_LENGTH(s.progress) - 1, '].taskName'))
        )
    ) AS last_activity_task_name,

    -- 7. Mic-check outcome, parsed from every `mic_check_result` event logged
    -- to `progress` (MicCheck.jsx), not just the single latest flag:
    --      mic_check_attempts     -> how many attempts were logged this session (NULL = never reached mic check)
    --      mic_check_pass_attempt -> which attempt number first passed (NULL = never passed)
    --      mic_check_last_error   -> error_type of the most recent attempt ('none' if it passed)
    mic.attempts AS mic_check_attempts,
    mic.pass_attempt AS mic_check_pass_attempt,
    mic.last_error_type AS mic_check_last_error,

    -- 8. Completion percentage — a rough progress gauge for admins who
    -- aren't familiar with this protocol's task list, not an exact count.
    -- Deliberately NOT sessions.current_task_index: that counter's 1-based
    -- position runs through the WHOLE runtime step list — volume_check,
    -- audio_guide_intro, info, identifiers, mic_check — before the real
    -- protocol_tasks even start (see ParticipantInterfacePage.jsx's intro
    -- steps + logInteraction), so it's on a completely different scale than
    -- protocol_tasks and overshoots 100% long before the participant is
    -- actually done. Instead, `completed.steps` (below) counts real
    -- `task_saved` events that carry a protocolTaskId — one per repeat
    -- attempt, so repeats are naturally counted correctly — against
    -- `steps.total_steps` (also repeat-aware, see that join's comment).
    -- NULL for 'created' (nothing to show yet); pinned to 100 once finished.
    CASE
        WHEN s.id IS NULL THEN NULL
        WHEN s.completed = 1 THEN 100
        WHEN COALESCE(steps.total_steps, 0) <= 0 THEN NULL
        ELSE LEAST(100, ROUND(COALESCE(completed.steps, 0) / steps.total_steps * 100))
    END AS completion_percent,

    -- 9. Resume deadline — the exact moment an 'in_progress' session flips to
    -- 'incomplete' (last activity + the same resume window used above).
    IF(s.id IS NULL, NULL, DATE_ADD(s.last_activity_at, INTERVAL 72 HOUR)) AS resumable_until

FROM participant_protocols pp
JOIN v_participant_protocols vpp ON pp.id = vpp.participant_protocol_id
JOIN participants part ON pp.participant_id = part.id
JOIN project_protocols proj_p ON pp.project_protocol_id = proj_p.id
JOIN protocols p ON proj_p.protocol_id = p.id
JOIN languages lang ON p.language_id = lang.id

-- LEFT JOIN: a participant who was assigned a protocol but never opened it
-- has no row in `sessions` at all, and must still show up (as 'created').
--
-- Only the LATEST session per assignment: initSession
-- (backend/src/controllers/sessionController.js) inserts a *new* `sessions`
-- row whenever there's no resumable session for this participant_protocol_id
-- (the return window expired, so status is 'incomplete') while reusing the
-- same participant_protocol_id — so one assignment can accumulate more than
-- one session row over time. Each participant_protocol_id must map to
-- exactly one Fieldwork row, so we take the highest session id (most recent
-- attempt), not every historical restart.
LEFT JOIN sessions s ON s.id = (
    SELECT MAX(s2.id) FROM sessions s2 WHERE s2.participant_protocol_id = pp.id
)

-- Pivots participant_protocol_contacts (one row per outreach touchpoint —
-- see backend/scripts/schema/create_tables.sql) into the flat columns the
-- Fieldwork table displays. A participant with no logged touchpoints simply
-- has no row here, so the LEFT JOIN naturally yields NULLs for it.
LEFT JOIN (
    SELECT
        participant_protocol_id,
        MAX(CASE WHEN contact_type = 'link_sent' THEN contacted_at END) AS link_sent_at,
        MAX(CASE WHEN contact_type = 'call' AND attempt_number = 1 THEN contacted_at END) AS call_1_at,
        MAX(CASE WHEN contact_type = 'call' AND attempt_number = 1 THEN notes END) AS call_1_notes,
        MAX(CASE WHEN contact_type = 'call' AND attempt_number = 2 THEN contacted_at END) AS call_2_at,
        MAX(CASE WHEN contact_type = 'call' AND attempt_number = 2 THEN notes END) AS call_2_notes,
        MAX(CASE WHEN contact_type = 'call' AND attempt_number = 3 THEN contacted_at END) AS call_3_at,
        MAX(CASE WHEN contact_type = 'call' AND attempt_number = 3 THEN notes END) AS call_3_notes
    FROM participant_protocol_contacts
    GROUP BY participant_protocol_id
) contacts ON contacts.participant_protocol_id = pp.id

-- Repeat-aware total step count per protocol, for completion_percent above.
-- Deliberately separate from v_participant_protocols/v_project_protocols'
-- own n_tasks/n_quest (raw task-row counts, used elsewhere for "how many
-- tasks are configured") — this one instead counts what a participant
-- actually steps through, expanding each row by its params.repeat.
LEFT JOIN (
    SELECT
        pt.protocol_id,
        SUM(COALESCE(JSON_VALUE(pt.params, '$.repeat'), 1)) AS total_steps
    FROM protocol_tasks pt
    GROUP BY pt.protocol_id
) steps ON steps.protocol_id = p.id

-- Real protocol-task completions per session: every `task_saved` progress
-- event that carries a protocolTaskId (i.e. an actual protocol_tasks row,
-- as opposed to an intro/system screen or a mic-check attempt). A repeated
-- task fires one such event per repetition, so COUNT(*) here already lines
-- up with `steps.total_steps` above without any separate repeat handling.
LEFT JOIN (
    SELECT
        sess.id AS session_id,
        COUNT(*) AS steps
    FROM sessions sess
    JOIN JSON_TABLE(sess.progress, '$[*]' COLUMNS (
        action VARCHAR(50) PATH '$.action',
        protocol_task_id INT PATH '$.protocolTaskId'
    )) jt ON jt.action = 'task_saved' AND jt.protocol_task_id IS NOT NULL
    GROUP BY sess.id
) completed ON completed.session_id = s.id

-- Per-session mic-check summary, built from every `mic_check_result` event
-- in `progress` (JSON_TABLE + ROW_NUMBER, supported since MariaDB 10.6).
-- A session with no progress or no mic-check events simply has no row here,
-- so the LEFT JOIN below naturally yields NULLs for it.
LEFT JOIN (
    SELECT
        numbered.session_id,
        COUNT(*) AS attempts,
        MIN(CASE WHEN numbered.passed = 'true' THEN numbered.mic_attempt_number END) AS pass_attempt,
        SUBSTRING_INDEX(GROUP_CONCAT(numbered.error_type ORDER BY numbered.mic_attempt_number DESC), ',', 1) AS last_error_type
    FROM (
        SELECT
            sess.id AS session_id,
            ROW_NUMBER() OVER (PARTITION BY sess.id ORDER BY jt.seq) AS mic_attempt_number,
            jt.passed,
            jt.error_type
        FROM sessions sess
        JOIN JSON_TABLE(sess.progress, '$[*]' COLUMNS (
            seq FOR ORDINALITY,
            action VARCHAR(50) PATH '$.action',
            passed VARCHAR(10) PATH '$.passed',
            error_type VARCHAR(30) PATH '$.error_type'
        )) jt ON jt.action = 'mic_check_result'
    ) numbered
    GROUP BY numbered.session_id
) mic ON mic.session_id = s.id

-- Dynamically join to find the task category using the protocolTaskId of the LAST event in the JSON
LEFT JOIN protocol_tasks pt
    ON pt.id = JSON_VALUE(s.progress, CONCAT('$[', JSON_LENGTH(s.progress) - 1, '].protocolTaskId'))
LEFT JOIN tasks t
    ON pt.task_id = t.id;