# Questionnaire conditional rules: desktop app brief

**Audience:** NewShare (desktop app) developers.

**Status:** the contract is fixed as of 2026-10-31, and the web side emits it. The app is not implemented yet.

**Normative text:** [`../ext_app_Task_Configuration_JSON_Spec.md`](../ext_app_Task_Configuration_JSON_Spec.md) §4.2.1. If the two documents disagree, that spec wins over this brief.

## 1. What changes in the config

A Question (§4.2.1) can carry one new, **optional** key:

```json
{
  "questionType": "OPEN",
  "questionKey": "p60_t3_q7",
  "questionTextKey": "p60_t3_q7_text",
  "questionRegex": ".+",
  "showIf": { "questionKey": "p60_t3_q3", "optionKeys": ["p60_t3_q3_o2", "p60_t3_q3_o3"] }
}
```

**Fields:**

| Field | Meaning |
|---|---|
| `showIf.questionKey` | The `questionKey` of an **earlier** question in the same QUESTIONNAIRE task, of type `SINGLE_CHOICE` or `MULTIPLE_CHOICE` |
| `showIf.optionKeys` | A non-empty subset of that source question's `questionOptions` |

**Compatibility:**
- A question without a rule has no `showIf` key, never `null`.
- Nothing else changes: no other keys, no `schemaVersion` bump, no endpoints and no upload ZIP or `examination.json` shape.
- Older app builds ignore the key (`ConfigDecoder` uses `ignoreUnknownKeys = true`) and show every question.

**Example:** `docs/ext_app_samples/questionnaires.json`, task `p60_t3`, questions `q7` and `q8`.

## 2. Required behaviour

1. **Visibility.** Evaluate the questions in order. A question is visible in either of two cases:
   - it has no `showIf`;
   - its source question is visible and the source's current selection contains at least one key from `optionKeys`.

   Because sources are always earlier questions, one forward pass is enough and cycles are impossible.
2. **Live updates.** Recompute visibility whenever an answer changes. Show or hide questions immediately, without a page change.
3. **Mandatory status.** A hidden question is not validated, so its required status does not apply. This covers both `questionRegex` `.+` and the "`SINGLE_CHOICE` needs exactly one option" rule. Once the question is shown again, it is validated as usual.
4. **Answers of hidden questions.**
   - When a question becomes hidden, clear its answer.
   - When it reappears, it starts empty and untouched (F-065: no error shown until it is touched or the user tries to submit).
   - The clearing cascades: hiding Q2 clears Q2, which can hide Q3 and clear Q3 too.
5. **Submitted answers.** `questionnaireAnswers` contains entries for **visible questions only**. A hidden question has no key, which is the same as how the web displays unanswered questions today.
6. **Presentation.** Visually indent conditional questions under the question they depend on, as the older shareapp did. Exact styling is up to the app (see the notes file, "App → Questionnaires UI").

## 3. Validation of a received config (recommendation)

The web validates rules on save and never emits an invalid one. For defensive decoding of hand-edited or legacy configs, the recommendation is:
- If `showIf.questionKey` does not name an earlier choice question in the same task, or if `optionKeys` is empty or not a subset of the source's `questionOptions`:
  - log a warning;
  - treat the question as **unconditional**, meaning always shown.
- Do not reject the whole config over a bad rule.

## 4. Touch points in NewShare (as of 2026-10-31)

All paths are under `app/src/main/kotlin/org/example/app/`.

| File | Change |
|---|---|
| `domain/config/Question.kt` | Add `val showIf: QuestionCondition? = null`, with `@Serializable data class QuestionCondition(val questionKey: String, val optionKeys: List<String>)` |
| `domain/config/ConfigValidator.kt` | Lenient checks as in §3 |
| `navigation/TaskComponent.kt` | `AnswerState` map handling: compute visible keys, clear the answers of hidden questions in `onOptionToggled`/`onOpenAnswerChanged` (cascade), make `allAnswersValid()` consider visible questions only, and build `questionnaireAnswers` (about lines 500-515) from visible questions only |
| `ui/TaskContent.kt` | `QuestionnaireBody` (about line 616) renders only visible questions and indents the conditional ones |

**Tests:**
- Update `ConfigDecoderTest`, `ConfigValidatorTest`, `WebSampleConfigsTest` and `ExampleConfigsTest` under `app/src/test/kotlin/org/example/app/domain/config/`.
- Update the fixtures in `fakes/ConfigFixtures.kt`.
- Copy the refreshed `questionnaires.json` sample.

## 5. Test cases for the app

| # | Setup | Action | Expected |
|---|---|---|---|
| 1 | Q3 single with options o1–o3; Q7 required open, `showIf {Q3, [o2, o3]}` | Open the task | Q7 is hidden, and Finish is allowed once Q1–Q6 are valid |
| 2 | Same as #1 | Pick Q3 = o2 | Q7 appears, and Finish is blocked until Q7 is filled |
| 3 | Same as #2, Q7 filled | Switch Q3 to o1 | Q7 disappears, its text is cleared and it is absent from `questionnaireAnswers` |
| 4 | Q4 multiple; Q8 `showIf {Q4, [o1]}` | Tick o2 only, then also tick o1 | Q8 is hidden after o2, then shown after o1 |
| 5 | Chain Q1 → Q2 → Q3 | Q2 is answered so that Q3 is shown, then Q1 changes so that Q2 is hidden | Both Q2 and Q3 are hidden and cleared |
| 6 | Hidden question that reappears | Submit attempted earlier | It reappears empty. It may show its error, because a submit was attempted (F-065) |
| 7 | `showIf` pointing to a missing key | Load the config | A warning is logged, the question is always shown and the config loads |
| 8 | An older app build | Load a config with rules | It decodes, and every question is shown (accepted limitation) |
