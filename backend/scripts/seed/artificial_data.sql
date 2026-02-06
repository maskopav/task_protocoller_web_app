-- ============================================
-- MINIMAL TEST DATA FOR TASKPROTOCOLLER DB
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------
-- 0) Users
-- --------------------------
-- Role 1 is 'Master'
-- IMPORTANT: Replace '$2b$10$GENERATED_HASH_HERE' with the output from node hash_gen.js
INSERT INTO users (`email`, `password_hash`, `full_name`, `role_id`, `must_change_password`) VALUES
('master@test.com', '$2b$10$GENERATED_HASH_HERE', 'System Master', 1, 0);

-- --------------------------
-- 1) Projects
-- --------------------------
INSERT INTO projects (id, name, description, start_date, is_active, frequency, country, contact_person, created_by, updated_at, updated_by)
VALUES
(1, 'Test Study 001', 'Initial testing project', '2026-01-01', 1, 'weekly', 'Global', 'Admin', 1, CURRENT_TIMESTAMP, 1);

SET FOREIGN_KEY_CHECKS = 1;