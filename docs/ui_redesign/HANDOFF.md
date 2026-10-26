# UI redesign: handoff (2026-10-26)

> **Batch 9 is done.** Results, open items and the critic's findings are in [05_results.md](05_results.md). All 18 criteria pass; the dev DB was recreated with `runInit.js` on 2026-10-26 and matches the test schema. The rest of this file is the state before batch 9.

Branch: `newshare`, working tree clean. Docs: [02_spec.md](02_spec.md) (spec; acceptance criteria in §10), [03_plan.md](03_plan.md) (plan, status, findings table), [04_agent_guidelines.md](04_agent_guidelines.md), [dependency_upgrade.md](dependency_upgrade.md).

## Where we are

| Increment | State | Commit |
|---|---|---|
| 1–3 Audit, spec, mockups | ✅ | `6a08360` |
| 4a Golden `/site-config` test | ✅ | `9cbacb1` |
| 4u Dependency upgrade | ✅ | `3bc7401`, `48e4fd6` |
| 4b Backend: schema, access, REST, library | ✅ | `da1b785` |
| 4c Frontend on `src/api/*` | ✅ | `cde8d97` |
| 5 Tokens, UI kit, app shell, routes | ✅ | `c6c6642` |
| 6 Recordings list + detail | ✅ | `0fe017a` |
| 7 Studies + Clinics | ✅ | `376904b` |
| 8 Users, auth pages, Library | ✅ | `f71ebe0` |
| 8b i18n parity and clean-up | ✅ | `a91cd6d` |
| 9 Final verify, "after" screenshots, `05_results.md` | ✅ | see `git log` |

Last measured (8b): frontend vitest 255, backend 741 (golden 5/5, fixtures clean), build OK, lint 57, full e2e 163 + the protected ingest spec 3/3 after the last fix. **Batch 9 must start with one clean full e2e run** (the last full run predates the "Device not registered" fix).

## Step 1 after the reset: batch 9 (no builder agents)

Docker `tp-mariadb` up (the user starts Docker Desktop; never start it yourself), Node 24, from the repo root.

1. **Baseline:** `git status` clean; `cd backend && npx vitest run` (741, golden 5/5, `git status backend/test/fixtures` clean); `cd frontend && npx vitest run` (255); `npm run build`; `npm run lint` (≤ 57); `npx playwright test --reporter=line` alone (expect all green, ~164).
2. **Criteria walk** — spec §10, criteria 1–18, one by one, with evidence (command output, test name or screenshot). Use the `/verify` skill. Checks that need a command:
   - 3 one primary action per page; 7 styling greps: one `:root` (`styles/tokens.css`), no `alert(` in `src/`, inline `style={{` in admin pages ≤ 5, no emoji icons in admin UI (known: ✕/➕ in `QuestionnaireModal`, `ProtocolLanguageSelector` — fix or record);
   - 9 desktop contract: golden 5/5 and `git diff c6c6642 -- frontend/e2e/uploads-ingest.spec.ts frontend/e2e/site-config.spec.ts` empty (site-config spec: only setup-call changes allowed);
   - 10 schema: `user_project_sites`, `project_protocols` gone; no whitelist SQL in `accessScope.js`; 12 grep `frontend/src` for old admin paths (`projects-list`, `/update`, `user-projects/`) and en JSON for user-facing "site"/"project";
   - 13 findings: each row of the plan's findings table has its check (F-037 screenshot not possible without a real MJPEG clip: record).
3. **One independent critic** (one Sonnet agent) on the whole redesign against §10, read-only, no Playwright.
4. **"After" screenshots** into `docs/ui_redesign/screens/after/`, same personas as the audit (master, clinic, editor, reviewer). Reuse `frontend/e2e/tools/increment7.capture.spec.ts` (with `ensureSeeded`) and update `e2e/tools/capture.spec.ts` (still has legacy `/admin/admin-management` paths). Run with `npx playwright test -c playwright.capture.config.ts <name>`.
5. **Write `docs/ui_redesign/05_results.md`:** criterion table (PASS/FAIL/not verified + evidence), before/after summary with screenshot pairs, closed findings (IDs for the NewShare owner), deviations (below), open items.
6. Update `docs/newshare_changes.md` (access section) and the README seed users; set the `03_plan.md` status rows 8/9.
7. Commit "final verification and results (increment 9)". Report to the user.

## Waiting on the user

- **Validated cs/de translations** of the RBDSQ and HHIE-S questionnaires and of the three reading passages (North Wind and the Sun, Grandfather, Rainbow). Until then English is the fallback. Never machine-translate them (memory `no-stimulus-translation`). Where they go: `frontend/src/i18n/{cs,de}/tasks.json` (`rbdsq.*`, `hhies.*`, `reading.params.topic.values.<name>.text`); when the passages arrive, drop the `STIMULI` exemption in `src/i18n/parity.test.js` for those languages. Check first whether these texts reach the desktop config (golden test must stay 5/5).
- Native-speaker review of all new cs/de UI strings.
- After the next deploy: camera check (MediaPipe 1.1.1), server `node -v` (≥ 22.12), one real password-reset email. See `dependency_upgrade.md`.

## Known deviations (for 05_results.md)

- **Recordings:** "unreviewed first" sorts only within the loaded page (needs a backend sort); no click-to-sort headers; short 8-char id kept (frozen ingest spec); protocol filter options from one page of ≤ 100 rows; KPI says "Invalid"; "Download all N" counts rows the bundle skips; a refused bundle POST shows raw JSON (pre-existing); `questionTexts` opens the ZIP on every detail load; ClipPlayer "can't play" is terminal; a page past the last shows no pager; late badge only from 4 days; server-check detail lines are English only (backend).
- **Studies/Clinics:** Protocols tab first, no Overview; Duplicate / Copy to another study copies one language variant; Clinic Settings saves all seven desktop keys with defaults (as the old modal); level indicator only Circle/Waveform (contract); no "Recordings waiting", editor "clinics they see", computers or last-upload columns (no endpoint); no protocol restore API; `ClinicPage` load not cancellable; runs-at on archived studies not gated (spec silent); browser Back not guarded in the editor.
- **Users/Library:** no "Studies they edit" or Last login (no endpoint); invite takes name and email only; masters show "All clinics" and no switches; library has no Length / Source study / Language filter / entry Preview.
- **Glossary exception:** en `unknown_device` stays "Device not registered" (frozen ingest spec asserts it).
- **Lint:** three React Compiler rules still off: `set-state-in-effect` (49), `refs` (11), `immutability` (1, `useVoiceRecorder` countdown).
- `npm audit fix` (quill, 2 low) not run: version changes only with the user's OK.

## Fixes the orchestrator made outside the agents' work (worth mentioning in results)

- `ToastProvider` was never mounted (increments 5–7 toasts were silent); now in `main.jsx`, asserted by `redesign-routes.spec.ts`.
- Assigning a computer could 500 (`ER_CHECKREAD`, MariaDB 11.8 snapshot isolation) racing the validation worker: `executeTransaction(cb, { retries })`, and the validation queue treats `ER_CHECKREAD` as retryable instead of marking the recording invalid.
- Bulk "Download all" de-duplicates ids and checks the 200 limit on downloadable rows.
- Agent i18n output corrected: no site/project words in cs/de, no "[cs]" placeholders, no machine-translated stimuli.

## Decisions made with the user

- Peer model (Studies and Clinics equal), Recordings is home, received studies a separate read-only group, visibility strictly by assigned clinics (memory `access-model`).
- No DB migration: `runInit.js` + seeds recreate every DB; never `alter_*`.
- Desktop contract frozen (`/site-config`, `/device-checkin`, `/upload`, config JSON, ZIP); golden fixtures regenerate only with the user's explicit OK.
- F-008: any clinic name 1–64 chars sent unchanged as `siteName`; the desktop sanitises; the web shows the file-name hint.
- Library: any editor shares, adding always copies, entries have `project_id` NULL.
- The master always sees the Clinics list; a non-master with one clinic goes straight to it unless they may create clinics.
- Study stimuli are never machine-translated.

## How to work

- Agents: Sonnet, at most 2 in parallel, `/usage` check by the user after every batch. Agents never touch git; the orchestrator verifies, runs a critic, commits.
- Briefs: disjoint file ownership; separate i18n namespaces per agent; say explicitly that stimuli in `tasks.json` are not to be translated.
- Parallel e2e runs collide on port 3001 and the test DB; the orchestrator runs the full suite alone.
- Commands: backend tests `cd backend && npx vitest run`; test DB `npm run db:test:reset`; e2e `cd frontend && npx playwright test` (starts backend :3001 and Vite :5183); screenshots `npx playwright test -c playwright.capture.config.ts <spec>`.
