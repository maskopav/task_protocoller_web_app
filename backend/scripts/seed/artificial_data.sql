-- ============================================
-- MINIMAL TEST DATA FOR TASKPROTOCOLLER DB
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------
-- 0) Users
-- --------------------------
-- Role 1 is 'Master', Role 2 is 'admin' (non-master — used to exercise requireRole('master') gating in tests)
-- IMPORTANT: Replace '$2b$10$GENERATED_HASH_HERE' with the output from node hash_gen.js
-- Both rows below share the same hash because it's a hash of the same test password ('1234'), not user-specific.
INSERT INTO users (`email`, `password_hash`, `full_name`, `role_id`, `must_change_password`) VALUES
('master@test.com', '$2b$10$PeuhdyiWpRnSpsYdFqxmO.znJ9R0Ss6/7UPO3QDwhJATby8oiZfVe', 'System Master', 1, 0),
('admin@test.com', '$2b$10$/Teq2XvSByAetcjsvriAb.FfoITQy0FoYP72hxE/vo6PRqI76J98m', 'Project Admin', 2, 0);

-- --------------------------
-- 1) Projects
-- --------------------------
INSERT INTO projects (id, name, description, start_date, is_active, frequency, country, contact_person, created_by, updated_at, updated_by)
VALUES
(1, 'Test Study 001', 'Initial testing project', '2026-01-01', 1, 'weekly', 'Global', 'Admin', 1, CURRENT_TIMESTAMP, 1),
(2, 'Test Study 002', 'Second testing project', '2026-01-01', 1, 'monthly', 'Global', 'Admin', 1, CURRENT_TIMESTAMP, 1);

-- --------------------------
-- 2) Sites
-- --------------------------
-- Site 1 inherits from two projects, site 2 from one — exercises the
-- multi-project config case (see docs/newshare_changes.md).
INSERT INTO sites (id, name, description, access_token, config_json, is_active, created_by)
VALUES
(1, 'Paris', 'Test site with two projects', 'paris000paris000paris000paris000', '{"defaultLanguage": "fr"}', 1, 1),
(2, 'London', 'Test site with one project', 'london00london00london00london00', NULL, 1, 1);

INSERT INTO site_projects (site_id, project_id) VALUES
(1, 1),
(1, 2),
(2, 1);

-- Assign the non-master admin to Paris so the user-scoped sites list is testable
INSERT INTO user_sites (user_id, site_id) VALUES (2, 1);

SET FOREIGN_KEY_CHECKS = 1;