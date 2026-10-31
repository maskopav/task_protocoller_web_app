# Questionnaire conditional rules: results

**Verified 2026-10-31** against [`01_spec.md`](01_spec.md) §5. An independent Sonnet reviewer, which had not seen the implementation reasoning, also checked the change.

## Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Tick box and source dropdown | PASS | `QuestionnaireModal.test.jsx` "offers the rule only where an earlier choice question exists" checks that the first question has no block, the sources are `Q1`/`Q2`, and the answers are listed. The E2E test `z-questionnaire-rules.spec.ts` covers it too. A screenshot was taken at the checkpoint. |
| 2 | Editor cleanup | PASS | `QuestionnaireModal.test.jsx` covers removing an option (indexes are remapped), removing a source question (the rule is cleared), unticking, and an empty rule being dropped on save. `questionConditions.test.js` "sanitizeShowIf …" covers type changes, forward rules and out-of-range indexes. |
| 3 | Persistence | PASS | The E2E test saves (v2), reloads, and finds the rule ticked with the same answer. `saveProtocol` writes the same `params` to every language variant (`protocolController.js`, task insert loop). |
| 4 | Backend validation | PASS | `protocolController.test.js` "400s a questionnaire rule that points at a later question" and `questionRules.test.js` (missing, later or ineligible source, bad or empty indexes, non-object rule) |
| 5 | Emission, goldens unchanged | PASS | `extConfig.test.js` "emits showIf only for conditional questions" covers the key shape and that every rule points to an earlier choice question. `siteConfigGolden.test.js` passes all 5 goldens with no `UPDATE_GOLDEN`. The E2E test reads `showIf` from the live `/site-config`. |
| 6 | Preview | PASS | `Questionnaire.test.jsx` covers questions hidden through a chain, hidden mandatory questions not blocking, and the submitted answers being `{1: "No"}` only. |
| 7 | i18n en/cs/de | PASS | Four keys under `protocolEditor.questionnaire`. Both parity tests pass in `npm test`. |
| 8 | Contract docs | PASS | `ext_app_Task_Configuration_JSON_Spec.md` §4.2.1, decision table row 16 with its note, `ext_app_samples/questionnaires.json` (`p60_t3_q7` and `q8`), and [`03_desktop_brief.md`](03_desktop_brief.md) |
| 9 | Tests and build | PASS | Backend `npm test`: 43 files, 786 tests. Frontend `npm test`: 39 files, 346 tests. `npm run build` passes. `npm run test:e2e`: 182 passed. |

## Changes beyond the plan

- **`frontend/src/pages/studies/protocolMapping.js`** now derives `type: "questionnaire"` from the task's type when the stored params lack it.
  - Before this, a questionnaire whose params had no `type` (the E2E seed, or imported data) opened the generic task dialog with "Questions: [object Object]".
  - Questionnaires saved from the editor always carried the field, so they were not affected.
- **`QuestionnaireModal.css`:** selects in the dialog no longer get vertical padding. `tokens.css` fixes the select height at 34px, so the padding clipped the text of both the source dropdown and the existing answer-type dropdown.
- **Sample configs:** only `docs/ext_app_samples/questionnaires.json` was regenerated. Regenerating the other 8 also picked up unrelated instruction-text changes made since 2026-10-09, so those 8 were left as they were.

## Reviewer findings

| Finding | Outcome |
|---|---|
| The backend rejected a falsy `showIf` (`false`), but the editor treats it as no rule | Fixed: the backend now treats any falsy value as no rule, with a test |
| The preview matches answers by option label, so duplicate labels such as `["Yes","Yes"]` can show a question for the wrong option | Open, preview only. The desktop app works with option keys and is not affected |
| The preview's auto-scroll does not scroll back to a conditional question that appears above the furthest point reached | Open, cosmetic |
| Duplicate question ids bind a rule to the first match | Open. Only possible with imported data, because the editor uses `Date.now()` ids |

## Not verified

- **The desktop app:** it is not implemented. [`03_desktop_brief.md`](03_desktop_brief.md) carries the test cases for the app team.
