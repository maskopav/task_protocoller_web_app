# UI redesign: implementation plan

The plan implements [`02_spec.md`](02_spec.md). The rules for implementers are in [`04_agent_guidelines.md`](04_agent_guidelines.md).

**Working rules:**
- Agents are Sonnet, with **at most 2 running in parallel**.
- After every batch: a report, then a `/usage` check by the user, then a decision whether to continue.
- Every increment ends in a checkpoint the user sees. No increment starts before the previous checkpoint is approved.

## Status

| # | Increment | State |
|---|---|---|
| 1 | Audit and "before" screenshots | ✅ done ([01_audit.md](01_audit.md)) |
| 2 | Spec, plan, guidelines | ✅ updated at the mockup checkpoint (F-008, received group, protocol library, dependency upgrade), then corrected after the independent checkpoint review |
| 3 | Clickable mockups | ✅ done ([mockups/index.html](mockups/index.html)). Review: no page errors, no broken links, at most one primary button per page. |
| 4 | Backend simplification (golden test → **dependency upgrade** → schema and routes) | ✅ 4a ✅ golden test; 4u ✅ all dependencies latest ([dependency_upgrade.md](dependency_upgrade.md)), e2e and camera check pending; 4b ✅ schema, access and REST routes (735 tests, golden 5/5, critic findings fixed); 4c ✅ frontend on `src/api/*`, e2e 88/88 |
| 5 | Frontend foundation (tokens, UI kit, shell, routes) | – |
| 6 | Recordings | – |
| 7 | Studies and Clinics | – |
| 8 | Users, clean-up, i18n | – |
| 9 | Verify and "after" screenshots | – |

---

## 3. Clickable mockups

**Owner:** me (the orchestrator), no agents. The design decisions need one hand.

- Build static HTML/CSS in `docs/ui_redesign/mockups/`. There is one shared `mockups.css`, which **becomes the seed of `tokens.css`** in increment 5.
- **Pages, linked through the sidebar:**
  - `recordings.html`
  - `recording.html`, including a quarantined variant
  - `studies.html`
  - `study-protocols.html`
  - `study-clinics.html`
  - `study-editors.html`
  - `study-received.html` (with the lock)
  - `protocol-editor.html`
  - `clinics.html` (master, with unassigned computers)
  - `clinic-studies.html` (with "What the computers receive")
  - `clinic-computers.html`
  - `clinic-settings.html`
  - `users.html` and `user.html`
  - `clinician-home.html` (the one-clinic view)
  - `login.html`
  - `library.html` and `library-entry.html` (added at the checkpoint)
  - `index.html` (overview)
- **Not mocked, on purpose:**
  - the Study and Clinic Recordings tabs: they are the Recordings table with a fixed filter;
  - Study › Settings: it is the New study form, shown inside a page;
  - the reset-password and setup-account pages: they use the login card.
- Use realistic data from the e2e seed: clinic names, protocols, patient codes.
- Provide one CS toggle, on `recordings.html`, to prove the length of Czech strings fits.
- Take screenshots via the capture tooling (a new small spec over `file://` pages) into `screens/mockups/`.
- **Checkpoint:** the user clicks through the mockups and iterates. **The spec gets updated with any decision change before increment 4.**

## 4. Backend simplification

**Batch 4a (1 agent):** the golden guard first.
- **4a.1:** capture `/site-config/:token` for every e2e seeded clinic into `backend/test/fixtures/site-config.golden/`. Add `test/integration/siteConfigGolden.test.js`.
- The fixtures are committed before any other backend change.

**Batch 4u (1 agent): upgrade every dependency to its latest version.**

This batch runs right after the golden guard and before any redesign code, so all new code is written against the new versions. It runs alone because it owns both `package.json` and lock files.

Snapshot from `npm outdated` (2026-10-25). Patch and minor bumps aren't listed.

| Area | Major upgrades |
|---|---|
| Build | `vite` 7 → 8, `@vitejs/plugin-react` 5 → 6 |
| Tests | `vitest` and `@vitest/coverage-v8` 4 → 5 (front and back), `jsdom` 29 → 30, `typescript` 5 → 7 (only used by the e2e specs) |
| Lint | `eslint` and `@eslint/js` 9 → 10, `eslint-plugin-react-hooks` 5 → 7, `eslint-plugin-react-refresh` 0.4 → 0.5, `globals` 16 → 17 |
| i18n | `i18next` 25 → 26 (front and back), `react-i18next` 16 → 17 |
| Runtime libraries | `@mediapipe/tasks-vision` 0.10 → 1.x (`useVideoRecorder.js`), `colorjs.io` 0.6 → 0.7 (`munsellUtils.js`), `dotenv` 17 → 18, `nodemailer` 9 → 10 |

**Order.** Each step ends with its own checks before the next step starts, so a failure points at one upgrade.
1. All patch and minor bumps (`npm update` in both packages). Run the full test suites.
2. `vitest` 5 + coverage + `jsdom` 30. Run the unit tests in both packages.
3. `vite` 8 + plugin-react 6 + basic-ssl. Run `npm run build`, the dev server and the e2e suite.
4. `eslint` 10 + plugins + `globals`. Migrate `eslint.config.js`. `npm run lint` must report no more problems than before the upgrade; new rules may be fixed or disabled with a comment saying why.
5. `i18next` 26 + `react-i18next` 17, front and back. Run the **golden `/site-config` test**: the backend builds the config's `strings` with i18next.
6. `@mediapipe/tasks-vision` 1.x. Check the API changes against `useVideoRecorder.js`. Then do a manual camera check in the participant preview, with a screenshot.
7. `colorjs.io`, `dotenv`, `nodemailer`, and `typescript` 7. Run the unit tests, plus one password-reset email against the dev mail setup.

**Node.**
- The new toolchain needs a newer Node: Vite 8 and ESLint 10 require at least 20.19 or 22.12, and the e2e suite already needs 22.2.
- Set `engines.node` in both `package.json` files to the highest minimum among the upgraded packages.
- Add an `.nvmrc` with the current Node LTS.
- Move CI (`.github/workflows/deploy.yml`, currently `'20'`) to the same LTS.
- The **server runtime** is installed from Debian `apt` (`docs/container_deployment.md`). The agent checks its version against `engines` and reports the result. It doesn't change the server.

**Rule for a blocker.** If an upgrade breaks something and the fix isn't mechanical, the agent stops that step and reports instead of downgrading quietly. Examples: a removed API with no replacement, or a behaviour change in the participant camera. You then decide: fix it, or hold that one package with its reason written in `docs/ui_redesign/dependency_upgrade.md`.

**Report.** `docs/ui_redesign/dependency_upgrade.md` contains:
- the before and after version table;
- breaking changes met and how each was resolved;
- packages held back, if any, with the reason;
- `npm audit` output before and after.

**Checkpoint:**
- `npm outdated` is empty in both packages, apart from holds you approved;
- build, lint, unit tests and e2e are green;
- the golden test is identical;
- `npm audit` shows no high or critical findings;
- the camera check has passed.

**Batch 4b (2 agents in parallel, disjoint files):**

| Agent | Owns | Task |
|---|---|---|
| **B1: schema and access** | `scripts/schema/*`, `scripts/seed/*`, `src/utils/accessScope.js` (+ test), `src/controllers/protocolController.js` (+ test), `src/controllers/projectController.js` (+ test), `src/runInit.js`, `package.json` scripts, `src/upload/siteContext.js` (+ test, and a new test for the protocol-match fallback), `scripts/utils/remove_items.sql`, and the tests that touch the removed tables: `uploadController.test.js`, `test/integration/uploadList.test.js`, `test/integration/sessionScope.test.js` | Spec §8.1 (including the library columns, and the new `isValidSiteName` rule in `utils/fieldValidation.js`) and §8.2. No migration: change `create_tables.sql` and `create_views.sql` directly, fold `alter_permissions.sql` into them, and delete it together with `applyPermissions.js` and `db:permissions`. **Keep the golden fixtures green:** seed site ids and tokens (sites 1–5), site names, project names ("Test Study 001", "Speech Study"), protocol names and `updated_at` behaviour stay as they are. New personas and data are added, never renamed. Seeds get the personas: master, `clinic@` (1 clinic, receives one study), `researcher@` (2 clinics, edits the multi-site study), `editor@` (edits a study, *not* assigned to one of its clinics, for the strict-scope test), `nogrant@`. |
| **B2: routes and endpoints** | `src/routes/*` except the desktop routers, `src/controllers/siteController.js`, `userController.js`, `userSiteController.js`, the new `projectEditorController.js`, removing `userProjectController.js` and `userProjectSiteController.js`, `uploadController.js` (activity, `unassigned_devices`), `deviceController.js` (F-045: the "Needs assignment" status, and rejected uploads not counted), and `docs/container_deployment.md` (remove the `db:permissions` step, and say that the schema is recreated) | Spec §8.3: the RESTful paths, editors, runs-at, `PUT /users/:id/sites`, `GET /uploads/:sid/activity`, `unassigned_devices` in summary, the library endpoints (new `libraryController.js` and `routes/library.js`). It depends on B1's function names in `accessScope.js`. Those are fixed in the spec (§8.2), so both agents can work in parallel. |

**Batch 4c (1 agent):** **F1, frontend API adaptation.**
- Create `src/api/*.js` per resource (spec §9), and repoint the *existing* pages at them. This is a mechanical change, so the old UI keeps working.
- Update the e2e specs that call old paths directly. `uploads-ingest.spec.ts` stays untouched. In `site-config.spec.ts`, only the two `PUT /projects/update` setup calls change (spec criterion 9).

**Checkpoint:**
- the golden test passes;
- backend `npm test` passes;
- `npm run db:test:reset` works;
- `npm run test:e2e` is green on the old UI;
- the old route paths are gone, shown by grep.

## 5. Frontend foundation

**Batch 5 (2 agents):**

| Agent | Owns | Task |
|---|---|---|
| **F2: design system** | `src/styles/tokens.css`, `src/components/ui/**` (+ vitest component tests), `src/utils/formatDate.js` (+ test), `src/components/ui/icons.jsx` | Build the UI kit from the mockups' CSS. Add `Toast`. Restyle `ConfirmDialog` in place. |
| **F3: shell and routing** | `src/App.jsx`, `src/main.jsx`, `src/components/ui/AppShell*` (in agreement with F2: F3 consumes `Button` and `icons` once F2 lands them, and uses placeholders until then), `src/pages/NotAvailablePage.jsx`, `src/pages/NotFoundPage.jsx`, the redirects, the i18n `nav` namespace (en, cs, de), `e2e/redesign-routes.spec.ts` | Add the new routes with the **old pages mounted inside the new shell** under the new URLs, plus the redirects. Delete the old top bar. |

To avoid both agents touching `AppShell` at once, F2 delivers the primitives first: the token file, `Button`, `icons`. F3 starts once they're in, so in practice F3 starts about 30 minutes later.

**Checkpoint:**
- screenshots of the shell on 3 routes;
- the redirect e2e test is green;
- the existing e2e specs are green, with testids preserved.

## 6. Recordings

**Batch 6 (2 agents):**

| Agent | Owns | Task |
|---|---|---|
| **F4: recordings list** | `src/pages/RecordingsPage.jsx` (replaces `UploadsPage`), the list components in `src/components/Uploads/**`, bulk download (absorbs `DownloadsPage`, then deletes it), the master unassigned-computers banner | Spec §6.1 |
| **F5: recording detail** | `SessionDetailPage` → `RecordingPage.jsx`, its components, the Activity section | Spec §6.2, plus F-035, F-036 (web side), F-037 fallback, F-040, F-043 and F-044 |

**Checkpoint:**
- screenshots;
- the uploads e2e specs are green;
- new tests for the strict scope (it shows in the UI as missing rows) and for the findings above.

## 7. Studies and Clinics

**Batch 7 (2 agents):**

| Agent | Owns | Task |
|---|---|---|
| **F6: Studies** | `src/pages/studies/**` (list, study tabs), the protocol editor restyle (`components/ProtocolEditor/**`, `ProtocolEditorPage`), the new-protocol modal | Spec §6.3 to §6.5, plus F-006, F-007 and F-058. It deletes `ProjectDashboardPage`, `ProtocolDashboardPage`, `components/Protocols/*` and `ProjectManagementPage`. |
| **F7: Clinics** | `src/pages/clinics/**` (list, clinic tabs), the Computers tab (absorbs `DevicesPage`), clinic settings | Spec §6.6 and §6.7, plus F-008 (the live file-name form under the name in New clinic and Settings, `src/utils/fileNameForm.js`, criterion 17), F-014, and the F-045 UI (B2 does the backend part). It deletes `SiteDashboardPage`, `SiteManagementPage` and `DevicesPage`. |

Shared component: the "runs at" switch list. **F6 builds it** in `src/components/RunsAt/`, and F7 consumes it. Until F6 lands it, F7 uses the exported stub.

**Checkpoint:**
- screenshots for all 4 personas;
- e2e tests for the lock, the one-clinic redirect, runs-at both ways, and editors.

## 8. Users, clean-up, i18n

**Batch 8 (2 agents):**

| Agent | Owns | Task |
|---|---|---|
| **F8: Users and auth** | `src/pages/users/**`, the auth pages restyle, deleting `AdminManagementPage` and its modals | Spec §6.8 and §6.9 |
| **F10: Protocol library** | `src/pages/library/**`, the "From library" half of the new-protocol modal, the Share / Update library entry row actions, the editor's library mode (`#/library/:id/edit`), `e2e/library.spec.ts` | Spec §6.10, the library parts of §6.4 and §6.5, criterion 16 |

**Batch 8b (1 agent), after 8:**

| Agent | Owns | Task |
|---|---|---|
| **F9: i18n and clean-up** | `src/i18n/**`, the parity test, deleting the dead code (spec §9 list), the grep checks for criteria 11 and 12, the F-011 and F-012 text fixes | Spec §9 and §10, criteria 11 and 12 |

**Checkpoint:** screenshots and green suites.

## 9. Verify

- Run `/verify` against spec §10, criterion by criterion, with an independent critic.
- Produce the "after" screenshots with the updated capture spec, and a short before/after summary in `05_results.md`.
- Update `docs/newshare_changes.md` (the access section) and the README seed users.
- Report to the NewShare owner which findings are closed.

## Findings and their checks

| Finding | Batch | Check |
|---|---|---|
| F-006 new protocol defaults | F6 | unit: create returns the `patient_code` identifier and the default template |
| F-007 Yes/No booleans | F6 | component test on the task catalogue |
| F-008 free clinic name | B1, F7 | unit (criterion 17), plus e2e: create "Olomouc University Hospital" |
| F-011, F-012 texts | F9 | grep for the fixed strings |
| F-013 mixed languages | F9 | i18n parity test |
| F-014 language variants counted as protocols | F7 | e2e: the clinic shows 1 protocol with 2 language chips |
| F-035 "undefined" values | F5 | component test with missing values |
| F-036 raw ffmpeg text | F5 | component test: the summary is shown, and the raw text only under Details |
| F-037 clip can't play | F5 | screenshot (needs a real MJPEG clip) |
| F-040 questionnaire keys | F5 | component test using a protocol snapshot |
| F-043 quarantined header | F5 | e2e on a seeded quarantined recording |
| F-044 reveal activity | B2, F5 | integration test for `GET /uploads/:sid/activity`, plus e2e: reveal a field, then the entry appears |
| F-045 Needs assignment and rejected uploads | B2, F7 | unit for the status and the count, plus e2e on an unassigned computer |
| F-058 protocol opens `/undefined` | F6 | e2e: create a protocol, and the URL has a numeric id |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A refactor silently changes `/site-config` output | Golden test written first (4a), running in every batch |
| Strict recordings scope surprises an existing user | Seeds and e2e cover it. The user agreed to it in the interview. Noted in `newshare_changes.md`. |
| Two agents editing the same file | Each batch has a file-ownership table. Shared pieces are built by one owner, with a stub for the other. |
| e2e churn hides regressions | `uploads-ingest.spec.ts` stays unmodified. `site-config.spec.ts` changes only in two setup calls, and its assertions stay the same (criterion 9). Testids are preserved. |
| Data on the test server | None needed: no migration, every database is recreated with `runInit.js` (user decision). |
| Node version | Use Node ≥ 22.2 for Playwright (`zlib.crc32`). Agents get the path in their brief. |
