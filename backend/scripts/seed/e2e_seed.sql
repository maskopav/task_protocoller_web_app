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
  (3, 'E2E Site', 'Fixed-token site for Playwright tests', 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2', '{"note":"e2e"}', 1, 1);

INSERT INTO site_projects (site_id, project_id) VALUES (3, 1);

SET FOREIGN_KEY_CHECKS = 1;