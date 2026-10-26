# UI redesign: handoff (updated 2026-10-26)

Branch: `newshare`. Docs: [02_spec.md](02_spec.md) (spec), [03_plan.md](03_plan.md) (plan and status), [04_agent_guidelines.md](04_agent_guidelines.md) (rules for agents), [dependency_upgrade.md](dependency_upgrade.md).

## Where we are

| Increment | State | Commit |
|---|---|---|
| 1–3 Audit, spec, mockups | ✅ | `6a08360` |
| 4a Golden `/site-config` test | ✅ | `9cbacb1` |
| 4u Dependency upgrade (all latest) | ✅ | `3bc7401`, `48e4fd6` |
| 4b Backend: schema, access, REST, library | ✅ | `da1b785` |
| 4c Frontend on `src/api/*` | ✅ | `cde8d97` |
| 5 Tokens, UI kit, app shell, routes | ✅ | `c6c6642` |
| 6 Recordings list + detail | ✅ verified 2026-10-26 | see `git log` |
| 7 Studies + Clinics (+ runs-at, editors, F6/F7) | ✅ verified 2026-10-26 | see `git log` |
| 8 Users + Library UI (F8, F10) | ✅ verified 2026-10-26 | see `git log` |
| 8b i18n and clean-up (F9) | ✅ verified 2026-10-26 | see `git log` |
| **9 Verify, "after" screenshots, `05_results.md`** | **next** (after the user's `/usage` check) | – |

## Increment 6 verification (done 2026-10-26)

- **Tests:** backend 738/738 (golden 5/5, fixtures clean), frontend vitest 206/206, build OK, lint 65, full e2e alone 133/133. The protected specs are unchanged since `c6c6642`.
- **Screenshots:** `screens/increment6/`, captured by `frontend/e2e/tools/recordings.capture.spec.ts`.
- **Fixed after review:**
  - cs/de `recording.json` used site/project words ("pracoviště", "Standort", "projekt"). They now say clinic/study, and the cs breadcrumb is "Záznamy" like the sidebar.
  - Bulk "Download all": the ids are de-duplicated (a row shifting between pages caused a 400), and the 200 limit is checked on the downloadable rows, not on the filter total.

### Known deviations in increment 6 (decide or log)

- **Sort order:** "Unreviewed first, then newest" only sorts within the loaded page, because the API sorts by one key. A true global order needs a backend sort option (`qc` puts "review" before "unreviewed").
- **No column sorting:** table headers don't sort by click; `DataTable` sorts on the client only. The URL `sort`/`dir` still works.
- **Banner link:** the unassigned-computers banner links to `/clinics`, not yet to an anchor. Increment 7 builds that section.
- **Short ID kept:** the patient cell still shows the 8-character recording ID, because the frozen ingest spec finds rows by it.
- **Protocol filter options:** they come from one unfiltered page of at most 100 rows. There's no protocol facet endpoint.
- **KPI label:** it says "Invalid", not "Failed server check".
- **F-037 screenshot:** not taken (it needs a real MJPEG clip). The plan allows that screenshot as the check, and the unit test covers the fallback.
- **Question texts:** `questionTexts` is read from the session ZIP's `task_configuration_snapshot.json`, which isn't stored in the DB. It is best effort, and empty when the ZIP is missing.
- **"Download all N" label:** N is the filter total, including invalid, read-only and validating rows that the bundle skips. The success toast names the real count.
- **Bundle refusal:** a refused form POST (409 validating, 404, 500 `file_missing`) navigates the tab to raw JSON. This predates the redesign and is documented in `api/uploads.js`. A fetch-based download would fix it.
- **Detail load:** `questionTexts` opens the ZIP on every detail load, including Previous/Next. It's safe (it never throws, and is capped at 4 MB), but it adds latency. Possible fixes: cache by `zip_sha256`, or a lazy endpoint.
- **ClipPlayer (F-037):** "can't play" is terminal, the same for network, 409 or 404 errors. `retried` never resets.
- **Pager:** a page beyond the last one (`?page=9`, or a shrinking filter) shows the empty state with no pager to step back.
- **Late badge:** `SessionPanel` `LATE_HOURS = 72` only triggers at 4 or more days, because of rounding to days.
- **Backend English:** server-check detail lines ("no site for this device", "recorded with … current is …") are English only.
- **Translations:** cs and de strings for the new `uploads.recordings.*` and `recording.*` keys need a native-speaker review, especially Czech plural forms. Czech mixes "nahrávka" and "záznam" for a recording. `uploads.json` cs is missing `cards.uploads.desc_one/_other` and `cards.perDay.bar_one/_other`, and de is missing `cards.uploads.desc_one/_other` (from increment 5).

## Increment 7 verification (done 2026-10-26)

- **Tests:** backend 742 (golden 5/5), vitest 242, build OK, lint 61, full e2e 156/156 (plus a targeted rerun after the last fixes). Screenshots: `screens/increment7/` (4 personas) and `screens/increment7/studies-flow/`.
- **Fixed by the orchestrator:**
  - `ToastProvider` was never mounted (since increment 5), so every toast was silently dropped. It is now in `main.jsx`, and `redesign-routes.spec.ts` asserts the toast region.
  - Assigning a computer could 500 with `ER_CHECKREAD` (MariaDB 11.8 snapshot isolation) while the validation worker touched the same rows. `executeTransaction` takes `{ retries }`, used by the assign. `validationQueue` now treats `ER_CHECKREAD` as retryable instead of closing the recording as invalid.
  - After a protocol save, a failed mappings refresh no longer reports the save as failed.
  - A one-clinic user with `can_create_sites` keeps the Clinics list (where "New clinic" lives); `singleClinic` is null for them.
  - Test fixes: the rename assertion (a named computer shows a short id) and the `/admin/projects/3` redirect target.
- **Logged, not fixed:**
  - Duplicate / "Copy to another study" copies only one language variant of a protocol group.
  - Clinic Settings saves all seven desktop keys with defaults (same as the old modal). Consider sending only set or changed keys.
  - Protocol-save error codes lack `apiErrors` texts (en partly; cs/de none), and de misses many `protocolEditor.*` keys: F9.
  - `ClinicPage` load has no cancellation; runs-at on archived studies is not gated (spec silent); browser Back is not guarded in the editor.
  - Agents' notes for F9: the global `p`/`h1` rules in `pages/Pages.css` leak into new pages; delete `AdminDashboardPage` with `SiteGrid`, `SiteModal`, `ProjectGrid`, `ProjectModal`, `StatusBadge`, `ProjectTable.css`; `Protocols.css` with the dead `Fieldwork/*`; unused `getProjectStats`, `uploadTools:devices.*`, `admin:management.siteManagement.*`; `ProtocolLanguageSelector.css` hex colours; "site (clinic)" in `admin.json`.
  - Deviations: no Overview tab (Protocols first, per spec); level indicator offers only Circle/Waveform (contract); no "Recordings waiting" or editor "clinics they see" columns (no endpoint); no protocol restore API.

## Increment 8 verification (done 2026-10-26)

- **Tests:** vitest 252, build OK, lint 60, full e2e 163 passed + 1 flaky (`protocol-manager` refetch count picked up the Recordings home's own `/projects` fetch; the test now waits for network idle first). Backend unchanged. Critic: nothing medium or higher. Screenshots: `screens/increment8/`.
- **Deviations:** Users has no "Studies they edit" section and no Last login (no endpoint); invite takes name and email only; master users show "All clinics" and no switches (the backend refuses changes to a master). Library has no Length / Source study columns, no entry Preview (preview route is study-bound), no Language filter; Edit and Withdraw sit in the ⋯ menu.
- **For F9:** user page buttons ("Save changes", "Send password reset link") render full width (old global button CSS); `components/DashboardTopBar` unused; `useProtocolManager` still sends `created_by: 1` (ignored by the server); `PlaceholderPage` may now be unused; legacy `/admin/admin-management` references in `e2e/tools/capture.spec.ts`; review cs/de of `users.json` and `library.json`.

## Increment 8b verification (done 2026-10-26)

- **Tests:** vitest 255 (incl. the new `src/i18n/parity.test.js`), backend 741 (one test went with the deleted `SITE_NAME_FORMAT_ERROR`; golden 5/5, fixtures clean, `clearMocks: true`), build OK, lint 57, full e2e 163 + the protected ingest spec after the fix below (3/3).
- **Done:** cs/de keys filled; en wording without site/project; F-011 typo; F-012 HHIE-S titles; dead code removed (admin dashboard, fieldwork, video test, `VideoRecorder` component, `Uploads/cards`, `DashboardTopBar`, `PlaceholderPage`); `:root` only in `styles/tokens.css` (old vars kept there as legacy aliases); old `Pages.css` rules scoped to `.app-container`; banner links to `/clinics#unassigned-computers`; docs no longer mention `db:permissions`. Lint rules `purity` and `static-components` are back on.
- **Corrected by the orchestrator:**
  - The agent padded 41 cs and 81 de questionnaire strings (RBDSQ, HHIE-S) with "[cs] …"/"[de] …" placeholders. Stripped to the English text, which is what participants saw before (fallback).
  - The agent machine-translated the three standard reading passages (North Wind and the Sun, Grandfather, Rainbow) into cs/de. Removed: they are study stimuli and need published, validated versions. The parity test exempts `reading.params.topic.values.*.text`; the passage labels stay translated.
  - "Device not registered" must stay as is in en (`unknown_device`): the frozen `uploads-ingest.spec.ts` asserts it. A known exception to the Computer glossary term.
- **Open (user decision / later):**
  - **Validated cs/de versions** of the RBDSQ and HHIE-S questionnaires and of the reading passages (or a decision to keep English).
  - Native-speaker review of all new cs/de UI strings.
  - Lint rules still off: `set-state-in-effect` (49 hits), `refs` (11), `immutability` (1, `useVoiceRecorder` countdown).
  - `npm audit fix` (quill, low) not run; emoji ✕/➕ in `QuestionnaireModal` and `ProtocolLanguageSelector`; `e2e/tools/capture.spec.ts` legacy paths.

## Decisions made with the user (beyond the spec text)

- **Model:** peer model, with Studies and Clinics as equals. Recordings is home. Received studies are a separate group. Visibility is strictly by assigned clinics. More in memory `access-model`.
- **No DB migration:** every DB is recreated by `runInit.js` + seeds. Never write `alter_*` scripts.
- **Desktop contract frozen:** `/site-config`, `/device-checkin`, `/upload`, the config JSON and the ZIP format. The golden test guards it, and regenerating fixtures needs the user's explicit OK.
- **F-008:** any clinic name, 1–64 characters, sent unchanged as `siteName`. The desktop sanitises it. The web shows the file-name form as a hint. There's no slug column.
- **Protocol library:** any editor shares. Adding always copies. Library entries have `project_id` NULL. Seeded in `e2e_seed.sql` (entries 4 and 5).
- **Master and Clinics:** the master always sees the Clinics list. Only non-masters with one clinic are redirected to their clinic.
- **Lint rules:** five React Compiler lint rules are off (`eslint.config.js`). F9 should re-enable them at the clean-up.
- **Camera check postponed.** Do it on the test server after the next deploy, together with `node -v` (needs ≥ 22.12). See `dependency_upgrade.md`.

## Open items (not blocking increment 7)

- **Camera check** (MediaPipe 1.1.1), the **server Node version**, and **one real password-reset email**.
- **Translation review** of everything new in cs and de: `nav.json`, the `common.json` `ui` block, `uploads.recordings.*`, `recording.json`, and the en-only `admin.json` `apiErrors` (needs cs/de in F9).
- **Clean-up for F9:**
  - `backend/vitest.config.js` has `clearMocks: false` because `src/routes/upload.test.js` "logging" depends on earlier tests. Make that test self-contained.
  - `npm audit fix` for 2 low findings in quill.
  - `docs/EXPLORATION_REPORT.md` and `newshare_changes.md` still mention `db:permissions`.
  - `fieldValidation.js` exports an unused `SITE_NAME_FORMAT_ERROR`.
  - The old CSS files (`Pages.css`, `Uploads.css`, `UploadTools.css`) still define `:root` variables that override tokens on old pages. Delete them when the last old page is gone.
- **Temporary route:** `/clinics/devices` mounts the old `DevicesPage` until F7's Computers tab replaces it.
- **Old pages lost their back link** when the top bar went: the protocol editor. Breadcrumbs come with increment 7.
- **pre-existing bug:** `faceMessage` is undefined at `frontend/src/components/VideoRecorder/VideoRecorder.jsx:96`.

## How to work (for the next session)

- **Agents:** Sonnet only, **at most 2 in parallel**, and stop for the user's `/usage` check after every batch.
- **Agent briefs:** give them disjoint file ownership. Name shared pieces and who owns them. Split i18n namespaces so two agents never edit the same JSON.
- **Agents never touch git.** An agent once ran `git stash` and briefly reverted the other agent's work. The orchestrator verifies, runs a critic, and commits.
- **Parallel e2e runs collide** on port 3001 and the test DB. Have only one agent run the full Playwright suite, or let them retry.
- **Increment 7 plan:** `03_plan.md` "7. Studies and Clinics".
  - F6 builds `src/components/RunsAt/`, and F7 consumes it.
  - Reuse `RecordingsTable` (props `fixed={{clinic|study}}`, `syncUrl`, `showKpis`) for the Study and Clinic Recordings tabs.
  - The backend API is ready: `/projects/:id/editors`, `/projects/:id/sites/:siteId`, `/sites/:id` with `receives[]`, `/library/*`.
  - Mockups: `docs/ui_redesign/mockups/study-*.html`, `clinic-*.html`, `protocol-editor.html`.
- **Commands:**
  - Backend unit tests: `cd backend && npx vitest run`.
  - Test DB: `npm run db:test:reset`.
  - E2E: `cd frontend && npx playwright test` (starts backend :3001 and Vite :5183 itself).
  - Mockup screenshots: Node scripts in the session scratchpad. They're gone after the session; re-create them if needed.
