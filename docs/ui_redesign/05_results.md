# UI redesign: results (increment 9, 2026-10-26)

Branch `newshare`. Spec: [02_spec.md](02_spec.md) (criteria in §10). Plan and findings table: [03_plan.md](03_plan.md). Screenshots: [`screens/before/`](screens/before/INDEX.md) and [`screens/after/`](screens/after/).

## Final numbers

| Check | Result |
|---|---|
| Backend `npx vitest run` | 742 / 742 (42 files; +1 in batch 9); golden `/site-config` 5 / 5; `test/fixtures` unchanged |
| Frontend `npx vitest run` | 255 / 255 (27 files), i18n parity test included |
| Frontend `npm run build` | OK |
| Frontend `npm run lint` | 57 problems (baseline before the redesign: 235; the ceiling for this increment: 57) |
| Full e2e `npx playwright test` (run alone) | 164 / 164 at the start of batch 9; **165 / 165** at the end (one test added; the per-route primary assertion added to 16 existing tests) |
| `npm outdated` (both) | nothing |
| `npm audit` | backend 0; frontend 2 low (quill), `npm audit fix` waits for the user's OK |

## Acceptance criteria (§10)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Navigation | PASS | `redesign-routes.spec.ts`: 16 routes render `app-shell` with every `nav-*` item; "the protocol editor runs in the collapsed shell" (`data-collapsed`). |
| 2 | Redirects | PASS | `redesign-routes.spec.ts`: 13 "old route … redirects to …" tests, plus `?site=`/`?project=` → `?clinic=`/`?study=`. |
| 3 | Single primary action | PASS | Added in batch 9: every route in the `redesign-routes` loop asserts ≤ 1 visible `.ui-btn-primary`. Per-page tests in `studies-study`, `clinics-ui`, `library`, `uploads-list`, `uploads-detail`, `uploads-downloads`. The legacy `.btn-primary` is used only in the participant recorder (preview; out of scope). |
| 4 | Received studies | PASS | e2e `studies-study` "a received study is locked" (3 tests: lock badge, no edit controls, server refuses); `admin-role` "an admin with only inherited project access cannot save a protocol"; integration `accessModel.test.js`: `updateProject` 403, `saveProtocol` 403, `archiveProtocol` 403 for the clinician. |
| 5 | One clinic | PASS | `redesign-routes` "#/clinics lands on the only clinic"; `uploads-list` "a one-clinic user sees no Clinic filter, no Clinic column and no banner". |
| 6 | Runs at | PASS | Unit `projectEditorController.test.js` "runs-at" (toggle, 403 non-editor, 404 unseen clinic, master); e2e from the study side (`studies-study`) and the clinic side (`clinics-ui`); **added in batch 9**: e2e "the change reaches the clinic computers through /site-config" (off → study gone from `/site-config/<clinic B>`, on → back). |
| 7 | Editors | PASS | Unit `projectEditorController.test.js` (`user_not_found` 404, `cannot_remove_creator`, `last_editor`, 403); e2e `studies-study` "editors", `admin-role` "study editors: an editor adds and removes a co-editor by email, a receiver cannot". |
| 8 | Strict recordings scope | PASS | Integration `accessModel.test.js` "editing a study does not widen the clinics a user sees", `sessionScope` integration; e2e `uploads-scoping` (editor of study 3 is not assigned clinic A: list, open and ticket download all 404). |
| 9 | Desktop contract | PASS | Golden 5 / 5. `git diff 6a08360 -- frontend/e2e/uploads-ingest.spec.ts` is empty. `git diff 6a08360 -- frontend/e2e/site-config.spec.ts` changes only the two setup calls (`PUT /projects/update` → `PATCH /projects/1`, body `{is_active}`); every `/site-config` request and assertion is byte-identical. |
| 10 | Schema | PARTIAL | After `runInit` (`npm run db:test:reset`), `task_protocoller_test` has none of `user_project_sites`, `user_projects`, `project_protocols` (information_schema query). `db:schema:diff .env .env.test` is **not clean**: (a) `mysqldump` is not installed on this host, so the script cannot run; (b) a column-level diff through `information_schema` shows the **dev DB `task_protocoller` is still the pre-redesign schema** (old tables present, `project_editors` and `protocols.project_id`/`copied_from_id` missing). It needs `node src/runInit.js` against `.env`, which wipes dev data: waiting for the user. |
| 11 | Styling | PASS (with recorded exceptions) | One `:root` (`styles/tokens.css`). `style={{` in `src/pages`: 0. `alert(`: 0 calls; the 3 grep hits are XSS payload strings in `IntroComponents.test.jsx`. Emoji: batch 9 replaced ✕/➕ (`QuestionnaireModal`, `ProtocolLanguageSelector`) and ⚠️/🎙️ (`IncompatibleBrowser`, `VideoViewFinder`, `Recorder` default title) with the UI-kit `Icon`. Left: ✓ in a log message (`ParticipantInterfacePage.jsx:1194`, not UI) and the typographic QC glyphs ○ ✓ ! ⊘ in `Uploads/format.js` (from the mockups, not emoji). |
| 12 | i18n | PASS | Parity test (`src/i18n/parity.test.js`) green. The critic found editor keys that existed in no locale (`common:cancel`/`delete`/`loading`/`error`, `common:add`, `protocolEditor.confirmDeleteInstructions*`): fixed in batch 9 (now `common:ui.*`, keys added in en/cs/de; de `buttons.cancel` was still "Cancel"). A one-off scan of every literal `t("…")` key without a default against en found no other gap. en JSON: no "site", "project" or "upload session". "device" appears only as the participant's own device (`common.json` mic/camera help), "Microphone device"/"Camera device" (hardware), and `invalidReason.unknown_device` = "Device not registered" (frozen ingest spec; glossary exception). |
| 13 | Findings | PASS (one deviation) | See the findings table below. F-014 is covered by a unit test instead of the e2e the plan named (the seed has no two-language protocol). F-037 has its fallback and a component test; the screenshot needs a real MJPEG clip. |
| 14 | Green | PASS | See "Final numbers". |
| 15 | Screenshots | PASS | `frontend/e2e/tools/capture.spec.ts` updated for the new routes (same 4 personas, 1440 px, full page, English, seeded data; modals opened, never submitted). 71 screens in `screens/after/<persona>/` with a `manifest.json` each. |
| 16 | Protocol library | PASS | e2e `library.spec.ts` (6 tests: list/search, add copies and opens the copy, later edit leaves the copy, no-rights user refused, another writer can add but not edit/withdraw, withdraw keeps the copy); `studies-study` "a name already used in the study is rejected inline"; unit `libraryController.test.js` (`name_taken`); integration `accessModel` "library entries never reach the config spine"; `siteContext.test.js` "reads the spine view only, which never contains library entries". |
| 17 | F-008 | PASS | Unit `fileNameForm.test.js` (`FakultninemocniceBrno`, desktop cases), `fieldValidation.test.js`, `siteController.test.js` ("Olomouc University Hospital", 64-char limit, empty → 400); e2e `clinics-ui` "F-008: any clinic name is accepted …" and "an empty or over-long name is rejected by the backend with 400". |
| 18 | Dependencies | PASS | `npm outdated` empty in both; `npm audit` no high/critical; Node 24 everywhere: `.nvmrc` 24, CI `node-version: '24'`, `engines.node` accepts ^24 in both packages. |

**Not verified:** criterion 10's `db:schema:diff` (see above); F-037 screenshot (no MJPEG clip); anything that needs a deploy (camera with MediaPipe 1.1.1, server `node -v`, a real password-reset email, see [dependency_upgrade.md](dependency_upgrade.md)).

## Findings for the NewShare owner

| Finding | Check | Evidence |
|---|---|---|
| F-006 new protocol defaults | unit | `studyHelpers.test.js`; e2e `studies-study` checks `${field.patient_code}` in the new protocol |
| F-007 Yes/No booleans | component | `ProtocolEditor/editor.test.jsx`, `studyHelpers.test.js` |
| F-008 free clinic name | unit + e2e | see criterion 17 |
| F-011 typos | grep | "procol" and "Sent reset link" gone from every locale (0 hits) |
| F-012 HHIE-S titles | grep | `tasks.json` `hhies` has its title in en |
| F-013 mixed languages | parity test | `src/i18n/parity.test.js` |
| F-014 language variants counted as protocols | unit (plan said e2e) | `siteController.test.js` "groupReceives … merging language variants"; the clinic shows "What the computers receive" (e2e `clinics-ui`) |
| F-035 "undefined" values | component | `Recording.test.jsx` |
| F-036 raw ffmpeg text | component | `Recording.test.jsx` |
| F-037 clip can't play | component (fallback) | `Recording.test.jsx`; screenshot not possible without a real MJPEG clip |
| F-040 questionnaire keys | component | `Recording.test.jsx` |
| F-043 quarantined header | e2e | `uploads-detail` "a quarantined recording shows the amber strip and 'Assign computer…' as its one primary action" |
| F-044 reveal activity | integration + e2e | `uploadActivity.test.js`; `uploads-detail` "revealing a hidden field shows up in the collapsed Activity section" |
| F-045 Needs assignment, rejected uploads | unit + e2e | `deviceController.test.js`; `clinics-ui` "a computer without a clinic reads 'Needs assignment' …" |
| F-058 protocol opened `/undefined` | e2e | `studies-study` "a blank protocol is saved and the editor moves to its real id" |

## Independent critic (batch 9)

One read-only Sonnet agent reviewed the whole redesign against §10, without Playwright. It found **no access-control hole** (every recordings endpoint goes through `scopeWhereClause` / `findScopedSession`, keyed on `user_sites` only; received studies 403, unseen 404) and **no change to the desktop contract** (`getSiteConfig`, `extConfig.js`, `deviceCheckin`, `v_site_protocols` columns, golden fixtures and `uploads-ingest.spec.ts` untouched). Its findings, each checked:

| # | Finding | Outcome |
|---|---|---|
| 1–4 | Editor and onboarding i18n keys missing in every locale ("cancel", "delete", "loading", raw `protocolEditor.confirmDeleteInstructionsTitle`) | Confirmed, fixed (criterion 12) |
| 7 | `archiveProtocol` did not refuse a protocol inside an archived study (`saveProtocol` does) | Confirmed, fixed: 403 `project_inactive`, unit test added |
| 5 | Clinic → Studies shows a received study's runs-at switch disabled (with a reason) instead of absent | Open: borderline; §4 says "absent, not disabled", §10.4 names only the study screen |
| 6 | The study protocol list returns `library_entry_id` / `copied_from_name` to receive-only users | Open, low: ids and names only; `GET /library/:id` still refuses them |
| 9 | Some backend error codes (`invalid_project`, `project_id_invalid`, `archived_required`, recording field codes) have no `admin.apiErrors` text | Open, low: shows the raw code, only on a malformed request |
| 10 | Two clinics whose names differ only in spaces/diacritics get the same file-name form | Open, low: accepted with F-008; a collision warning would be new scope |

## Before and after

Same personas, same viewport. The left column is from the audit ([before/INDEX.md](screens/before/INDEX.md)).

| Before | After | What changed |
|---|---|---|
| `master/02-dashboard-home` (tile wall, no navigation) | `master/02-recordings-home` | Recordings is home; a sidebar replaces "← Back"; one primary action; a quarantine banner with a way to fix it |
| `master/03-user-management` (three stacked tables, icon-only actions) | `master/04-users`, `05-users-modal-invite`, `06-user-detail` | One users list; a detail page with clinics and permission switches; invite by name and email |
| `master/08-project-management` + `master/17-project-detail` | `master/07-studies`, `09-study-protocols`, `11-study-clinics`, `12-study-editors` | One home per study with tabs; protocols first; runs-at and editors in the study |
| `master/11-site-management` + `master/14-site-detail` | `master/15-clinics`, `17-clinic-studies`, `18-clinic-computers`, `20-clinic-settings` | One home per clinic; "What the computers receive" (F-014); Computers absorbs the Devices page; the token masked |
| `master/21-protocol-create-editor-new` (`/protocols/undefined`) | `master/10-study-modal-new-protocol` | A "New protocol" modal (blank or from the library); the editor opens on the real id (F-058) |
| `master/22-protocol-editor-existing` | `master/13-protocol-editor` | Three-column workspace in the collapsed shell; one primary (Save); icons from the UI kit |
| `master/25-uploads-list`, `27-devices`, `28-downloads` | `master/02-recordings-home`, `18-clinic-computers` | Downloads merged into Recordings (tick and "Download"); devices moved to each clinic |
| `master/26-upload-session-detail` | `master/03-recording-detail` | Download ZIP as the one primary; Activity collapsed; masked values until "Show values" |
| `clinic/03-user-management` (silent redirect to the dashboard) | `clinic/04-users` | "Not available" page inside the shell, with a way back |
| `clinic/08-protocol-list` ("Inactive / Archived: read-only" on an active project) | `clinic/06-study-protocols` | Lock badge "Received" and "Managed by …; you can review its recordings, but not change the study" |
| `master/29-404` (no navigation) | `master/22-404` | 404 inside the shell with a link to Recordings |

Notes on the "after" set: the clinic persona's `#/library` shows the shared "Not available" page, whose text says "only available to administrators" although Library is gated on writing protocols (minor copy issue, open). The editor's full-page capture stops the sidebar background at 900 px because the editor panels scroll internally (capture artefact, not a layout bug).

## Fixes outside the builder agents' work

- `ToastProvider` was never mounted, so the toasts of increments 5–7 were silent; now in `main.jsx` and asserted by `redesign-routes.spec.ts`.
- Assigning a computer could fail with 500 (`ER_CHECKREAD`, MariaDB 11.8 snapshot isolation) while racing the validation worker: `executeTransaction(cb, { retries })`, and the validation queue retries `ER_CHECKREAD` instead of marking the recording invalid.
- Bulk "Download all" de-duplicates ids and checks the 200 limit on downloadable rows only.
- Agent i18n output corrected: no site/project words in cs/de, no "[cs]" placeholders, no machine-translated stimuli.
- Batch 9: the per-route primary-action assertion and the runs-at → `/site-config` e2e test; emoji replaced with UI-kit icons (criterion 11); the critic's missing i18n keys; `archiveProtocol` refuses archived studies.

## Known deviations

- **Recordings:** "unreviewed first" sorts only within the loaded page (needs a backend sort); no click-to-sort headers; short 8-char id kept (frozen ingest spec); protocol filter options come from one page of ≤ 100 rows; the KPI says "Invalid"; "Download all N" counts rows the bundle skips; a refused bundle POST shows raw JSON (pre-existing); `questionTexts` opens the ZIP on every detail load; ClipPlayer's "can't play" is terminal; a page past the last shows no pager; the late badge starts at 4 days; server-check detail lines are English only (backend).
- **Studies / Clinics:** Protocols tab first, no Overview; Duplicate and "Copy to another study" copy one language variant; Clinic Settings saves all seven desktop keys with defaults (as the old modal did); level indicator only Circle / Waveform (contract); no "Recordings waiting", "clinics they see" for editors, computers or last-upload columns (no endpoint); no protocol restore API; `ClinicPage` load not cancellable; runs-at on archived studies not gated (spec silent); browser Back not guarded in the editor.
- **Users / Library:** no "Studies they edit" or "Last login" (no endpoint); invite takes name and email only; masters show "All clinics" and no switches; the library has no Length, Source study or Language filter and no entry Preview.
- **Glossary exception:** en `unknown_device` stays "Device not registered" (the frozen ingest spec asserts it).
- **Lint:** three React Compiler rules are still off: `set-state-in-effect` (49), `refs` (11), `immutability` (1, `useVoiceRecorder` countdown).
- `npm audit fix` (quill, 2 low) not run: version changes only with the user's OK.

## Open items

- **Dev database:** recreate with `cd backend && node src/runInit.js` (wipes dev data), then `db:schema:diff` (needs `mysqldump` on the PATH, or run it inside the `tp-mariadb` container).
- Validated cs/de versions of RBDSQ, HHIE-S and the three reading passages (English is the fallback; never machine-translated). Native-speaker review of the new cs/de UI strings.
- After the next deploy: camera check (MediaPipe 1.1.1), server `node -v` (≥ 22.12), one real password-reset email.
- The three lint rules above; the deviations listed above that need backend endpoints; critic items 5, 6, 9, 10.
- The "Not available" page text says "only available to administrators" also for Library, which is gated on writing protocols.
