-- ============================================
-- E2E-ONLY SEED DATA — site with one protocol
-- ============================================
-- Runs AFTER runInit.js (schema + seed_all.sql + artificial_data.sql) against
-- the disposable task_protocoller_test database only (see backend/package.json
-- db:test:reset). Never run this against the dev or production database —
-- it assumes a fresh DB where projects.id=1 (from artificial_data.sql) and
-- tasks 1-12 (from seed_all.sql) exist, so it hardcodes IDs exactly like
-- artificial_data.sql already does.
--
-- Builds one protocol (three task types) linked to project 1, plus a site with
-- a fixed access token so the Playwright E2E tests can fetch
-- /site-config/<token> without an extra setup API call.
-- NOTE: artificial_data.sql already seeds sites 1-2 and project_protocols is
-- empty at this point; ids below continue from there.

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------
-- 1) Protocol
-- --------------------------
INSERT INTO protocols
  (id, protocol_group_id, name, language_id, version, is_current, created_by,
   randomization, use_audio_guide, required_identifiers)
VALUES
  (1, 1, 'E2E Test Protocol', 1, 1, 1, 1,
   '{"strategy":"none"}', 0, '[]');

-- --------------------------
-- 2) Global consent screen
-- --------------------------
INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html)
VALUES
  (1, NULL, 'consent', '<p>E2E test consent text. No real participant data is collected here.</p>');

-- --------------------------
-- 3) Tasks (task_order must be sequential per protocol)
-- --------------------------
INSERT INTO protocol_tasks (protocol_id, task_id, task_order, params) VALUES
  -- syllableRepeating (voice, countDown mode) — duration shrunk from the 7s default to 3s
  (1, 2, 1, '{"duration": 3, "syllable": "ta"}'),
  -- sdmt (cognitive, countDown mode) — duration shrunk from the 90s default to 3s, keypad off
  (1, 11, 2, '{"duration": 3, "showKeypad": "never"}'),
  -- questionnaire — one required single-choice question
  (1, 6, 3, '{"title": "Quick Check", "questions": [{"id": "q1", "type": "single", "text": "How did that feel?", "options": ["Good", "Bad"]}]}');

-- --------------------------
-- 4) project_protocols — links protocol 1 to project 1 (from artificial_data.sql)
-- --------------------------
INSERT INTO project_protocols (id, project_id, protocol_id)
VALUES
  (1, 1, 1);

-- --------------------------
-- 5) E2E site — the fixed access_token the E2E tests fetch /site-config with.
-- Inherits protocol 1 via project 1.
-- --------------------------
INSERT INTO sites (id, name, description, access_token, config_json, is_active, created_by)
VALUES
  (3, 'E2E Site', 'Fixed-token site for Playwright tests', 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2', '{"defaultLanguage":"en","languages":["en"]}', 1, 1);

INSERT INTO site_projects (site_id, project_id) VALUES (3, 1);

-- --------------------------
-- 6) Upload-management personas (uploads-*.spec.ts). Sessions are NOT seeded
-- here: the specs create them through the real POST /upload path. The fixture
-- sessions belong to project 'Speech Study' (id 3), which both upload clinics (sites 4 and 5) run. It has its own protocol, because the server
-- matches a session to its project through the site's protocols (v_site_protocols). Site 3
-- stays untouched so site-config.spec.ts still sees exactly one protocol.
-- Password for all of them is 1234 (same hash as master@test.com).
-- --------------------------
INSERT INTO projects (id, name, description, start_date, is_active, countries, contact_persons, contact_emails, created_by, updated_at, updated_by)
VALUES (3, 'Speech Study', 'Project of the upload fixtures', '2026-01-01', 1, 'Czechia', 'E2E', 'e2e@example.org', 1, CURRENT_TIMESTAMP, 1);

INSERT INTO sites (id, name, description, access_token, config_json, is_active, created_by)
VALUES
  (4, 'E2E Clinic A', 'Upload tests: clinic A', 'e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4', '{"defaultLanguage":"en","languages":["en"]}', 1, 1),
  (5, 'E2E Clinic B', 'Upload tests: clinic B', 'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5', '{"defaultLanguage":"en","languages":["en"]}', 1, 1);

INSERT INTO protocols
  (id, protocol_group_id, name, language_id, version, is_current, created_by,
   randomization, use_audio_guide, required_identifiers)
VALUES
  (2, 2, 'Speech battery', 1, 1, 1, 1, '{"strategy":"none"}', 0, '[]');

INSERT INTO project_protocols (id, project_id, protocol_id) VALUES (2, 3, 2);

INSERT INTO site_projects (site_id, project_id) VALUES (4, 3), (5, 3);

INSERT INTO users (`email`, `password_hash`, `full_name`, `role_id`, `must_change_password`) VALUES
('clinic@test.com', '$2b$10$/mFCk6K0PxTUKHKusGPFMedj6oJD9Dul3219rfQ8Jhr4BTTNP8F/q', 'Clinic Admin', 2, 0),
('editor@test.com', '$2b$10$/mFCk6K0PxTUKHKusGPFMedj6oJD9Dul3219rfQ8Jhr4BTTNP8F/q', 'Project Editor', 2, 0),
('reviewer@test.com', '$2b$10$/mFCk6K0PxTUKHKusGPFMedj6oJD9Dul3219rfQ8Jhr4BTTNP8F/q', 'Read-only Reviewer', 2, 0),
('nogrant@test.com', '$2b$10$/mFCk6K0PxTUKHKusGPFMedj6oJD9Dul3219rfQ8Jhr4BTTNP8F/q', 'No Grants', 2, 0);

-- clinic: site grant only (E2E Clinic A)
INSERT INTO user_sites (user_id, site_id)
SELECT id, 4 FROM users WHERE email = 'clinic@test.com';

-- editor: project 3 with edit rights, narrowed to E2E Clinic B (site 5)
INSERT INTO user_projects (user_id, project_id, can_edit)
SELECT id, 3, 1 FROM users WHERE email = 'editor@test.com';
INSERT INTO user_project_sites (user_id, project_id, site_id)
SELECT id, 3, 5 FROM users WHERE email = 'editor@test.com';

-- reviewer: project 3, read-only, all of its clinics
INSERT INTO user_projects (user_id, project_id, can_edit)
SELECT id, 3, 0 FROM users WHERE email = 'reviewer@test.com';

SET FOREIGN_KEY_CHECKS = 1;