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
) agg ON agg.protocol_id = proto.id;


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
    qr.session_id,
    qr.protocol_task_id,
    def.quest_name,
    def.q_text,
    -- Extract the answer using the ID from our new CTE view
    JSON_VALUE(qr.answers, CONCAT('$."', def.q_id, '"')) AS participant_answer,
    qr.created_at
FROM questionnaire_responses qr
JOIN v_quest_definitions def ON qr.protocol_task_id = def.protocol_task_id;


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
        JSON_VALUE(s.progress, CONCAT('$[', s.n, '].protocolTaskId')) AS protocol_task_id,
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
    t.category AS task_category,
    fd.question_id,
    fd.interaction_value
FROM flattened_data fd
JOIN v_participant_protocols vpp ON fd.participant_protocol_id = vpp.participant_protocol_id
LEFT JOIN protocol_tasks pt ON fd.protocol_task_id = pt.id
LEFT JOIN tasks t ON pt.task_id = t.id
ORDER BY fd.session_id, fd.event_time;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_session_summary AS
WITH RECURSIVE seq AS (
    -- 1. Flatten the JSON progress log to access all timestamps
    SELECT 
        id AS session_id,
        participant_protocol_id,
        progress,
        completed,
        0 AS n
    FROM sessions
    WHERE JSON_LENGTH(progress) > 0
    
    UNION ALL
    
    SELECT 
        session_id,
        participant_protocol_id,
        progress,
        completed,
        n + 1
    FROM seq
    WHERE n + 1 < JSON_LENGTH(progress)
),
session_events AS (
    -- 2. Convert ISO strings to actual MariaDB Datetime format
    SELECT 
        session_id,
        participant_protocol_id,
        completed,
        CAST(REPLACE(REPLACE(JSON_VALUE(progress, CONCAT('$[', n, '].timestamp')), 'T', ' '), 'Z', '') AS DATETIME(3)) AS event_time
    FROM seq
)
-- 3. Aggregate results to find total duration and metadata
SELECT 
    se.session_id,
    vpp.participant_id,
    vpp.full_name AS participant_name,
    vpp.project_name,
    vpp.protocol_name,
    
    -- Timestamps
    MIN(se.event_time) AS session_started_at,
    MAX(se.event_time) AS session_last_activity_at,
    
    -- Overall Duration in Seconds
    -- This calculates the time elapsed from the very first event to the very last
    TIMESTAMPDIFF(SECOND, MIN(se.event_time), MAX(se.event_time)) AS total_duration_seconds,
    
    -- Finished Status
    -- Pulls directly from the 'completed' column in the sessions table
    CASE 
        WHEN se.completed = 1 THEN 'Finished' 
        ELSE 'Incomplete' 
    END AS protocol_status,
    
    se.completed AS is_finished_flag
FROM session_events se
JOIN v_participant_protocols vpp ON se.participant_protocol_id = vpp.participant_protocol_id
GROUP BY se.session_id;