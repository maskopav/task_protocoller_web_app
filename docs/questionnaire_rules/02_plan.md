# Questionnaire conditional rules: implementation plan

The work is split into increments, and each one ends at a checkpoint. It is implemented inline. If agents are used, at most 2 run at once, on Sonnet, with a usage check between batches.

## Increment 1: docs

**Changes:**
- Write `01_spec.md`, `02_plan.md` and `03_desktop_brief.md`.
- In `docs/ext_app_Task_Configuration_JSON_Spec.md`, document `showIf` in §4.2.1.
- In `docs/config_alignment_decision_table.md`, add row 16 and a final-decision note.

**Checkpoint:** the user reviews the contract.

## Increment 2: shared logic

Create `frontend/src/utils/questionConditions.js`, ported from `main:frontend/src/utils/questionConditions.js` and adapted to option indexes. It exports:
- `isConditionSource(q)`
- `getConditionSourceQuestions(questions, id)`
- `isQuestionVisible(q, answers, questions)`
- `getVisibleQuestions(questions, answers)`
- `pruneHiddenAnswers(questions, answers)`
- `clearDanglingShowIf(questions, removedId)`
- `remapShowIfOnOptionRemove(questions, sourceId, index)`
- `sanitizeShowIf(questions)`

In the preview, answers are keyed by `q.id`. A single-type answer is the option label, and a multiple-type answer is an array of labels. Visibility therefore converts the stored indexes to labels through the source's `options`.

Unit tests go in `questionConditions.test.js`.

**Checkpoint:** the tests pass.

## Increment 3: editor UI and i18n

- **`QuestionnaireModal.jsx`:**
  - Add the handlers `setShowIfEnabled`, `setShowIfSource` and `toggleShowIfOption`, and the rule block.
  - `removeQuestion` calls `clearDanglingShowIf`.
  - `removeOption` calls `remapShowIfOnOptionRemove`.
  - `handleSave` calls `sanitizeShowIf`.
- **`QuestionnaireModal.css`:** add the `.qm-condition-*` styles, using tokens only.
- **`admin.json` (en, cs, de):** add `protocolEditor.questionnaire.showOnlyIf`, `ruleSource`, `ruleAnswers` and `ruleNoAnswers`.
- **`QuestionnaireModal.test.jsx`:** test the tick box, the dropdown, the delete and remove-option cleanup, and the save output.

**Checkpoint:** the modal tests pass and a screenshot of the dialog is taken.

## Increment 4: backend

- **`backend/src/utils/questionRules.js`:** add `validateQuestionRules(questions)`, which returns `true` or `false`, with unit tests.
- **`protocolController.saveProtocol`:** reject invalid rules with `400 {error:'invalid_question_rule'}`.
- **`extConfig.js`:** build an `id → index` map and emit `showIf: {questionKey, optionKeys}` for valid rules only.
- **`extConfig.test.js`:** test emission, omission and skipping of invalid rules.
- **`gen-ext-configs.js`:** in the `questionnaires` scenario, add two conditional questions (one with a single source and one with a multiple source), then regenerate `docs/ext_app_samples/questionnaires.json`.

**Golden test:** `siteConfigGolden.test.js` must still pass with no `UPDATE_GOLDEN`.

## Increment 5: preview and E2E

- **`components/Questionnaire/Questionnaire.jsx`:** render `getVisibleQuestions`, base validity on the visible questions only, and prune hidden answers when an answer changes. Add a new test.
- **New Playwright spec in `frontend/e2e/`:** create a protocol with a questionnaire, add a rule, save, reopen and check that the rule persists, then check that `/site-config` contains `showIf`.

## Increment 6: verify

Run `/verify` against criteria 1-9 of `01_spec.md` and write `05_results.md`.

## Commands

| Area | Commands |
|---|---|
| Backend | `cd backend && npm test`, then `npm run db:test:reset` and `npx vitest run test/integration/siteConfigGolden.test.js` |
| Frontend | `cd frontend && npm test` and `npm run build` |
| E2E | `cd frontend && npm run test:e2e` |

The database runs in Docker (`tp-mariadb`). If the daemon is down, the user starts Docker Desktop.
