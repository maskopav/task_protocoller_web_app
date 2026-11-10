# Questionnaire configurator: adaptive width — spec

Source: docs/notes/notes_for_agent_app_web.md (Web, line 40). Approved 2026-11-10.

## Context
Note in `docs/notes/notes_for_agent_app_web.md:40` (Web): the questionnaire dialog in the protocol editor "was too wide and now it's too narrow".
- **Too wide (before 51035ce):** the form was `width: 60vw` inside a 640px dialog, so it overflowed the dialog.
- **Too narrow (now):** the form is `width: 100%` of `.ui-modal-wide`, a fixed **640px** (`frontend/src/components/ui/ui.css:100`). On a desktop screen the question text is truncated ("I sometimes have very vivid drea…"), the type select is clipped ("Single choice (…"), and "Allow write-in" wraps onto two lines.
- **Root cause:** a dense, multi-column editor is sharing the 640px "wide" size meant for simple forms. The inner layout also switches to stacked using a **viewport** media query (`@media (max-width: 700px)`), so it cannot respond to how wide the dialog actually is.

**Goal:** the dialog grows with the screen up to a comfortable cap and fills a small screen, and the inner rows reflow based on the dialog's own width, so nothing is clipped or overflows at any viewport size.

## Spec

**Deliverable:** CSS and prop changes in the frontend only, plus `docs/questionnaire_width/spec.md` (same shape as `docs/recordings_sort/spec.md`, written first per the docs-before-code rule).

**Acceptance criteria (checkable)**
1. Viewport 1920 px: the questionnaire dialog is wider than 640 px and no wider than 1040 px (the cap), and it is centred.
2. Viewport 1280 px: the dialog is ≥ 900 px wide (or up to the cap) with the side gutter kept.
3. Viewport 1024 px and 800 px (narrowest supported; phones are not supported): the dialog fits the viewport minus the existing `--s-4` gutter, and the page does not scroll horizontally.
4. At every width above, the question row (text, type, Optional) has no clipped select text. When the dialog content is narrower than 720 px the row stacks: text on its own line, then the type select (200–260 px) with Optional beside it, or wrapped beneath it when there is no room.
5. "Allow write-in" stays on one line. The option input takes the remaining width.
6. The other dialogs that use `AdminModal` (task settings, page, admin forms) and `NewProtocolModal` stay at their current 640 px. The change applies only to the questionnaire dialog.
7. `npm test` (vitest) passes, `npm run build` passes, and a new test asserts that the questionnaire dialog gets the new size class while the default `AdminModal` does not.

**Verification plan**
- Criteria 1–5: open the real app locally (`run` skill or claude-in-chrome), open a protocol with the RBD-SQ questionnaire, and take screenshots at 1920 / 1280 / 1024 / 800 px, in en, cs and de, with the longest type label ("Multiple choice") and a long unbroken rule answer. Measure the dialog with `getBoundingClientRect` and check `document.documentElement.scrollWidth <= innerWidth`.
- Criteria 6–7: vitest plus a screenshot of one task-settings dialog to confirm it is still 640 px.
- Finish with the `/verify` skill (independent critic run against these criteria).

## Approach

1. **UI kit: add an `xl` modal size** (`components/ui/Modal.jsx`, `ui.css`)
   - `size: 'md' | 'wide' | 'xl'`, class `ui-modal-xl`.
   - `.ui-modal-xl { width: min(1040px, 100%); }`. This works because `.ui-modal-back` already has the side padding and `.ui-modal` has `max-width: 100%`, so the dialog grows fluidly with the viewport until it reaches the cap.
   - Update the JSDoc.
2. **Pass the size through `AdminModal`** (`components/ProtocolEditor/Modal.jsx`)
   - Add the prop `size = "wide"` and forward it. All existing callers keep their current behaviour.
   - `QuestionnaireModal.jsx` passes `size="xl"`.
3. **Reflow the inner layout from the dialog's own width** (`QuestionnaireModal.css`)
   - Add `container-type: inline-size` to `.questionnaire-modal-form`.
   - `.qm-card-body`: a grid of `minmax(0, 1fr) minmax(170px, 220px) auto`. Remove the fragile `:nth-child` flex rules.
   - Replace `@media (max-width: 700px)` with `@container (max-width: 720px)`: the row becomes a wrapping flex row (text 100%, type `flex: 0 1 260px; min-width: 200px`, Optional wraps when needed). (Breakpoints revised after the first browser check: at 640 the type select clipped; the type select is now content-sized (`grid-template-columns: minmax(0,1fr) auto auto`, `width: auto`) so cs/de labels never clip. Conditional-rule answer labels get `overflow-wrap: anywhere`.)
   - `.qm-option-row .qm-inline-label { white-space: nowrap; }`. The option input gets `flex: 1; min-width: 0`.
   - Keep the existing tokens, colours and radii. This is a layout fix, not a restyle: frontend-design's quality floor (responsive to mobile, no clipping, visible focus) applies, but no new visual identity is introduced.
4. **Tests** (`QuestionnaireModal.test.jsx`, `ui/` tests)
   - The questionnaire dialog has the `ui-modal-xl` class.
   - `AdminModal` without a size has `ui-modal-wide`.
   - The CSS contains `@container` and no longer has the 700px viewport media query.

**Files:** `frontend/src/components/ui/Modal.jsx`, `frontend/src/components/ui/ui.css`, `frontend/src/components/ProtocolEditor/Modal.jsx`, `frontend/src/components/ProtocolEditor/QuestionnaireModal.jsx`, `frontend/src/components/ProtocolEditor/QuestionnaireModal.css`, `frontend/src/components/ProtocolEditor/QuestionnaireModal.test.jsx`, and the new `docs/questionnaire_width/spec.md`.

## Assumptions (veto any of these)
- A 1040 px cap is the right comfortable maximum. It keeps the question-text line under about 80 characters and leaves the editor visible around the dialog.
- Only the questionnaire dialog changes. Task and page dialogs stay at 640 px.
- No change to the desktop contract, the data or the i18n strings.

## Guidelines for the implementing agent
- Layout fix only: reuse existing tokens/colours/radii; no restyle, no i18n changes.
- Do not change the size of any dialog other than QuestionnaireModal.
- Run `npm test` and `npm run build` in `frontend/`; report output. Do not commit.

## Verification evidence
Capture script: `frontend/e2e/tools/questionnaire-width.capture.spec.ts`
(`npx playwright test -c playwright.capture.config.ts questionnaire-width`).
Screenshots and `measurements.json` are in `docs/questionnaire_width/screens/`.
