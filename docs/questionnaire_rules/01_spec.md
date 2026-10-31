# Questionnaire conditional rules: specification

**Status:** approved 2026-10-31.

**Source:** [`../notes/notes_for_agent_app_web.md`](../notes/notes_for_agent_app_web.md), the "Questionnaires" item.

**Scope:** this round implements the web app (editor, storage, validation, preview, `/site-config` emission) and specifies the desktop contract. The NewShare app is implemented later from [`03_desktop_brief.md`](03_desktop_brief.md).

| Document | Purpose |
|---|---|
| `01_spec.md` | What is built and how it is accepted (this file) |
| [`02_plan.md`](02_plan.md) | Increments, files, verification |
| [`03_desktop_brief.md`](03_desktop_brief.md) | The contract and the behaviour the desktop app must implement |
| `05_results.md` | Verification results, written at the end |

---

## 1. Goal

A protocol author can make a questionnaire question conditional. The question appears only when an earlier question was answered with one of the chosen answers.

If a conditional question is hidden, its mandatory flag is ignored. If it is shown, its mandatory flag applies as usual.

## 2. Rule model (decided)

- **One source question per rule.** The rule lists one or more answers of that source, combined with OR.
- **Chains are allowed.** For example, Q3 can depend on Q2, which depends on Q1. A question whose source is hidden is hidden too.
- **Sources** are earlier questions of type `single`, `dropdown` or `multiple` that have at least one option. `open` and `rating` questions cannot be sources.
- **A `multiple` source matches** when any of the rule's answers is among the selected ones.
- **Only earlier questions can be sources.** Questions cannot be reordered inside the questionnaire dialog, so array order decides what "earlier" means. This also makes cycles and forward references impossible.
- **Out of scope:** AND across several sources, `rating` as a source, and `main`'s `unlessLanguage` and `repeatFor`.

### 2.1 Stored shape (web)

The rule is stored on a question inside `protocol_tasks.params.questions[]`:

```json
{ "id": 1783259602375, "text": "Since when?", "type": "open", "options": [], "optional": false,
  "showIf": { "questionId": 1783259600000, "optionIndexes": [1, 2] } }
```

- `questionId` is the source question's `id`.
- `optionIndexes` holds 0-based indexes into the source's `options`. The list is non-empty, has no duplicates and is sorted.
- A question has no rule when `showIf` is absent or `null`.
- **Why indexes and not labels** (the `main` branch uses labels):
  - Renaming an option keeps the rule.
  - Language variants pair options by index, the same way `extConfig.js` does.

### 2.2 Emitted shape (desktop contract)

The rule is emitted on a Question in `/site-config`. The key is optional and additive. The full contract is in [`../ext_app_Task_Configuration_JSON_Spec.md`](../ext_app_Task_Configuration_JSON_Spec.md) §4.2.1.

```json
"showIf": { "questionKey": "p60_t3_q3", "optionKeys": ["p60_t3_q3_o2", "p60_t3_q3_o3"] }
```

`showIf` is emitted only when the question has a valid rule. Questions without a rule are emitted exactly as they are today, so the golden fixtures do not change.

### 2.3 Runtime semantics (web preview and desktop)

1. Evaluate questions in order.
2. A question is **visible** in either of two cases:
   - it has no `showIf`;
   - its source is visible and the source's current answer contains at least one of the rule's options.
3. **Hidden questions:**
   - They are not validated, so their mandatory flag does not apply.
   - Their answers are discarded, and the discard cascades to their dependents.
   - They have no entry in the submitted answers (`questionnaireAnswers` on the desktop).
4. Visibility is re-evaluated live whenever an answer changes.

## 3. Editor UI

The rule block sits in each question card of the questionnaire dialog (`QuestionnaireModal.jsx`), below the "optional" checkbox. It is shown only if the question has at least one eligible earlier source. It follows the screenshots `../notes/images/q-conditional-config.png` and `q-conditional-dropdown.png`.

- **Tick box:** "Only show this question if a previous answer matches".
  - Ticking it selects the first eligible source and leaves no answers ticked.
  - Unticking it removes the rule.
- **When ticked:**
  - A dropdown lists the earlier eligible sources as `Q<n>: <text>`, where `n` is the question's 1-based position.
  - Below it is one checkbox per option of the chosen source.
  - Changing the source resets the ticked answers.
- **Hint:** while no answer is ticked, a hint says the rule is ignored until an answer is selected.
- **Consistency maintenance:**
  - Deleting a question clears every rule that uses it as a source.
  - Removing an option drops that option's index from dependent rules and shifts the higher indexes down by one. If no index remains, the rule has no answers.
  - On save, `sanitizeShowIf` drops any rule that has no answers, whose source is missing, not earlier or no longer eligible (for example after a type change to `open` or `rating`), or that has out-of-range indexes.
- **Labels:** all new labels are i18n keys under `admin.json` → `protocolEditor.questionnaire.*` in en, cs and de.

## 4. Backend

- **Validation in `saveProtocol`:**
  - Every `showIf` in every questionnaire task's `params.questions` must be well formed. That means `questionId` refers to an **earlier** question of an eligible type, and `optionIndexes` is a non-empty array of integers within range.
  - Otherwise the request fails with `400 {error: 'invalid_question_rule'}`.
  - `null` or absent is fine.
- **Emission in `extConfig.js`:** questions are mapped from `id` to position. A rule that is not valid at emission time is skipped, so the endpoint never fails because of a bad rule. Legacy data may contain one.

## 5. Acceptance criteria

1. **Tick box and dropdown.** Every question with at least one eligible earlier source shows the tick box. Ticking it shows the source dropdown and the per-answer checkboxes. Unticking it removes the rule.
2. **Editor cleanup.** The editor keeps rules consistent on delete, on option removal, on type change and when no answers are ticked (§3).
3. **Persistence.** Rules survive save, reopen and saving a new version, and are present in every language variant.
4. **Backend validation.** `saveProtocol` rejects malformed rules with `400 invalid_question_rule`.
5. **Emission.** `buildExtConfig` emits `showIf` with the correct keys and omits it when there is no rule. All 5 golden `/site-config` fixtures pass unchanged.
6. **Preview.** The in-browser preview hides unmet questions, does not require hidden mandatory questions, and drops their answers.
7. **i18n.** The new strings exist in en, cs and de, and both parity tests pass.
8. **Contract docs.** The contract spec §4.2.1 documents `showIf` and its semantics, the decision table has a new row, `docs/ext_app_samples/questionnaires.json` contains an example, and the desktop brief is written.
9. **Tests and build.** Backend and frontend `npm test`, the frontend build and the new E2E test pass.

## 6. Known limitation

Desktop builds older than the rule support decode `showIf` as an unknown key and ignore it (`ignoreUnknownKeys = true`). They show every question, so a mandatory conditional question is still required there. Rules take effect once the app implements [`03_desktop_brief.md`](03_desktop_brief.md).
