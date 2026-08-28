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

    -- 2. SITES (From site_projects)
    COALESCE(site_stats.count_sites, 0) AS count_sites

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
-- JOIN 2: Get Site Counts
LEFT JOIN (
    SELECT
        project_id,
        COUNT(*) AS count_sites
    FROM
        site_projects
    GROUP BY
        project_id
) site_stats ON p.id = site_stats.project_id;

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

-- View for the User-Site Assignments Table
CREATE OR REPLACE VIEW v_user_site_assignments AS
SELECT
    us.id as assignment_id,
    us.user_id,
    u.full_name as user_name,
    u.email as user_email,
    s.id as site_id,
    s.name as site_name,
    us.assigned_at
FROM user_sites us
JOIN users u ON us.user_id = u.id
JOIN sites s ON us.site_id = s.id
JOIN roles r ON u.role_id = r.id
WHERE r.name != 'master'
ORDER BY us.user_id, s.name;

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

-- Site -> project -> current protocol spine.
-- Used by the site config endpoint and the admin site/project detail reads.
CREATE OR REPLACE VIEW v_site_protocols AS
SELECT
    s.id            AS site_id,
    s.name          AS site_name,
    s.is_active     AS site_is_active,
    pr.id           AS project_id,
    pr.name         AS project_name,
    pr.is_active    AS project_is_active,
    proto.id        AS protocol_id,
    proto.name      AS protocol_name,
    proto.version   AS protocol_version,
    proto.language_id,
    l.code          AS language_code
FROM sites s
JOIN site_projects sp     ON sp.site_id = s.id
JOIN projects pr          ON pr.id = sp.project_id AND pr.is_active = 1
JOIN project_protocols pp ON pp.project_id = pr.id
JOIN protocols proto      ON proto.id = pp.protocol_id AND proto.is_current = 1
JOIN languages l          ON l.id = proto.language_id;
