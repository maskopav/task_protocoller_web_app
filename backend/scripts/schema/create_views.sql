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

CREATE OR REPLACE VIEW v_quest_results AS
SELECT 
    qr.session_id,
    vpp.participant_id,
    vpp.protocol_id,
    vpp.project_id,
    
    -- Questionnaire Metadata from the root of protocol_tasks.params
    JSON_VALUE(pt.params, '$.title') AS quest_name,
    JSON_VALUE(pt.params, '$.description') AS quest_description,
    
    -- Question Details extracted via JSON_TABLE
    jt.q_text,
    jt.q_type,
    
    -- The Participant's Answer
    -- Note: We use double quotes in pathing to handle numeric-string keys correctly
    JSON_VALUE(qr.answers, CONCAT('$.', jt.q_id)) AS participant_answer,
    
    qr.created_at AS response_submitted_at
FROM questionnaire_responses qr
JOIN protocol_tasks pt ON qr.protocol_task_id = pt.id
JOIN sessions s ON qr.session_id = s.id
JOIN v_participant_protocols vpp ON s.participant_protocol_id = vpp.participant_protocol_id
CROSS JOIN JSON_TABLE(pt.params, '$.questions[*]' COLUMNS (
    q_id   VARCHAR(50)  PATH '$.id',
    q_text VARCHAR(255) PATH '$.text',
    q_type VARCHAR(50)  PATH '$.type'
)) jt;