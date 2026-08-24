-- ============================================
-- E2E-ONLY SEED DATA — full participant protocol
-- ============================================
-- Runs AFTER runInit.js (schema + seed_all.sql + artificial_data.sql) against
-- the disposable task_protocoller_test database only (see backend/package.json
-- db:test:reset). Never run this against the dev or production database —
-- it assumes a fresh DB where projects.id=1 (from artificial_data.sql) and
-- tasks 1-12 (from seed_all.sql) exist and nothing has been inserted into
-- protocols/participants/participant_protocols yet, so it hardcodes IDs
-- exactly like artificial_data.sql already does.
--
-- Builds one protocol covering three task types so the Playwright E2E test
-- (frontend/e2e/participant-flow.spec.ts) can walk: consent -> mic check
-- (auto-injected because a voice task is present) -> a short voice recording
-- (syllableRepeating, task_id=2) -> a timed cognitive task (sdmt, task_id=11)
-- -> a questionnaire (task_id=6) -> completion screen.
--
-- The participant access token below is fixed (not randomly generated like
-- assignmentHelper.js normally does) so the test can navigate straight to
-- /participant/<token> without an extra setup API call.

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
-- 2) Global consent screen (exercises the ConsentPage checkbox + button)
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
-- 4) Participant
-- --------------------------
INSERT INTO participants (id, external_id, full_name, creation_source)
VALUES
  (1, 'e2e-participant-001', 'E2E Test Participant', 'admin');

-- --------------------------
-- 5) project_protocols — links protocol 1 to project 1 (from artificial_data.sql)
-- --------------------------
INSERT INTO project_protocols (id, project_id, protocol_id, access_token)
VALUES
  (1, 1, 1, NULL);

-- --------------------------
-- 6) participant_protocols — the fixed access_token the E2E test navigates to
-- --------------------------
INSERT INTO participant_protocols
  (id, participant_id, project_protocol_id, access_token, start_date, is_active)
VALUES
  (1, 1, 1, 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2', UTC_TIMESTAMP(), 1);

SET FOREIGN_KEY_CHECKS = 1;
