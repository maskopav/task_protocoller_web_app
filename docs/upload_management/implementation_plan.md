# Upload management (phase B): implementation plan

Read with [`specification.md`](specification.md) (**what** to build) and
[`guidelines.md`](guidelines.md) (**how**). This file covers order, ownership and progress.
Update the checklist in §4 whenever a task lands.

## 1. Execution model

- Work happens on branch `newshare`. Every agent task runs in its own **git worktree** and owns
  a disjoint set of files (§3). The lead (main session) merges each task back, runs the full
  test suites and resolves conflicts.
- **At most two agents run at the same time.** After each pair finishes, the lead reports to the
  user and checks token usage before starting the next pair.
- Models:
  - **Opus** for security- and correctness-critical work: wave 0 (the lead), ingest, and the
    final security review.
  - **Sonnet** for everything else.
- An agent reports done only when the definition of done (DoD) for its task is met. Every DoD
  includes: `cd backend && npx vitest run` green, no new lint errors, and only owned files
  touched (plus additions to `package.json`/lockfile where listed).

## 2. Local environment (set up once by the lead)

| Piece | How |
|---|---|
| Node 22 | portable in `%LOCALAPPDATA%\devtools\node`, prepended to `PATH` |
| MariaDB 11.8 | Docker container `tp-mariadb`, `127.0.0.1:3306`, volume `tp-mariadb-data`; DBs `task_protocoller` (dev) and `task_protocoller_test` (e2e) |
| Config | `backend/.env`, `backend/.env.test` (not committed) with `DATA_PATH` under `backend/.data/` (git-ignored) |
| Bootstrap | `npm ci` (backend, frontend) → `npm run db:test:reset` → `npx playwright install chromium` |
| Baseline | existing backend vitest + Playwright suites green **before** phase B changes |

DB integration tests that need a real database read `.env.test`. They are skipped with a clear
message when `DB_HOST` is unreachable, so agents without the container still get unit
coverage.

## 3. Tasks

### Wave 0: contracts and foundations (lead, Opus, inline)

Owns:
- `scripts/schema/{create_upload_tables,drop_tables}.sql`, `src/applyUploads.js`, the
  `db:uploads` script and the `runInit.js` hook
- `src/utils/accessScope.js` additions plus their tests
- the JSDoc contracts and stubs under `src/upload/`, `src/storage/` and `src/backup/`
- `src/config/uploads.js` (env parsing) and `src/storage/fileStore.js` (fully implemented, so
  A, C and F share one storage layer)
- `test/helpers/testDb.js` (rollback-only real-DB helper) and
  `test/integration/sessionScope.test.js`
- the `yauzl` dependency (added for the fixture tests, so B uses it without adding it)
- `test/fixtures/buildSessionZip.js` plus the fixture tests
- `.gitignore` (`backend/.data/`)

Deliverables:
- The six tables (spec §5), seed-free. `runInit.js` and `npm run db:uploads` both work.
- `canSeeSession`, `canEditSession` and `scopeWhereClause`, with tests that cover the four
  personas from `mock-data.js` (Master, Project Admin, Clinic Admin, read-only Reviewer) and
  quarantine.
- **Fixture builder.** `buildSessionZip({variant, …overrides}) → {path, sha256, sessionId,
  installationId}` writes a real ZIP to a temp dir. It is built from the UD examples and uses
  small synthetic WAV/MP4 payloads. Variants:
  - `valid`
  - `noMaster`
  - `edited`
  - `manifestHashMismatch`
  - `missingEntry`
  - `unlistedEntry`
  - `idMismatch`
  - `badJson`
  - `zipSlipName`
  - `recovered+interrupted`
  - `nonstdMic`
  - `oldConfig`
- Stub modules with final exported signatures and JSDoc, each throwing `not implemented`, so
  wave 1/2 agents code against fixed interfaces.

DoD: all of the above, existing tests green, committed.

### Wave 1

**A. Ingest** (agent, **Opus**)
- Owns `src/upload/{multipartReceiver,ingestService,validationQueue}.js`, `src/routes/upload.js`,
  and the `server.js` mount (including the `loadUploadConfig`/`ensureDataPath` boot check and
  `queue.recover()`), plus their tests. Uses `src/storage/fileStore.js` as it is.
- Adds `busboy`.
- Implements spec §3. `validationQueue` calls `archiveValidator`/`sessionExtractor` through
  their stub interfaces, so it works with B's real ones after the merge.
- Tests: supertest against the app with a temp `DATA_PATH` and mocked `executeQuery`. Cases:
  - happy path
  - checksum 400
  - same-hash re-send 200 with the original receipt and the `duplicate` flag
  - different-hash 409
  - quarantine 404
  - oversized 400 (small `UPLOAD_MAX_BYTES`)
  - unknown or duplicate part 400
  - temp file removed on every failure path
  - filename never logged (spy on the logger)
  - concurrent duplicate insert falls back to step 3
  - queue re-enqueues `validating` rows at start

**B. Archive validation and extraction** (agent, **Sonnet**)
- Owns `src/upload/{archiveValidator,sessionExtractor,zipReader}.js` plus their tests.
- `yauzl` is already installed. Note that with `decodeStrings: true` it rejects `../` names
  by itself, so the reader opens with `decodeStrings: false` (see `zipReader.js` and the
  fixture test).
- Implements spec §4, using a table-driven test per fixture variant, plus extractor unit tests
  for every flag rule and the task-result computation (Done/Skipped/Missing from the snapshot,
  including `nrepetition`).
- Adds `currentSiteConfigVersion(site, protocols)`, extracted from `utils/extConfig.js:226`
  without changing its behaviour. `extConfig.test.js` must stay green.

### Wave 2

**C. Backup** (agent, **Sonnet**)
- Owns `src/backup/*`, `src/runBackup.js`, and the backup section of
  `docs/container_deployment.md`.
- Implements spec §10: Memory + Directory targets, the contract suite run against both,
  `MariaDbDumper` (unit test with a fake spawn, plus an opt-in integration test through
  `BACKUP_DUMP_CMD` against the container), `backupService` with a fake dumper and clock, and
  the CLI with exit codes.

**D. Devices** (agent, **Sonnet**)
- Owns `src/controllers/deviceController.js`, `src/routes/devices.js`, the `getSiteConfig`
  device upsert (small, additive change in `siteController.js`), and `POST /device-checkin`,
  plus their tests.
- Implements spec §6, including `PUT /devices/:id/site`, which re-enqueues the moved sessions
  through `validationQueue`.

### Wave 3

**E. Read and review API** (agent, **Sonnet**)
- Owns `src/controllers/uploadController.js` (list, detail, summary, attempts, reveal,
  participant, qc, comments, CSV) and `src/routes/uploads.js` (read and review routes), plus
  their tests.
- Implements spec §7–§8. Every query is scoped through `scopeWhereClause` or
  `canSeeSession`/`canEditSession`, and the tests assert that out-of-scope requests return 404.

**F. Downloads** (agent, **Sonnet**)
- Owns `src/controllers/downloadController.js` and the download routes, which it appends to
  `src/routes/uploads.js` in a marked block, plus their tests.
- Adds `archiver`.
- Implements spec §9 (single with sidecar, clips with Range, bundle with limits, audit).

### Wave 4: frontend

**G. Uploads list and session detail** (agent, **Sonnet**)
- Owns `frontend/src/api/uploads.js`, `components/Uploads/{UploadsPage,SessionDetailPage,…}`,
  the routes in `App.jsx`, and the i18n keys under `uploads.*`.
- Matches `ui_design/uploads.html` and `session.html`.

**H. Devices and downloads pages** (agent, **Sonnet**)
- Owns `components/Uploads/{DevicesPage,DownloadsPage}`, `frontend/src/api/devices.js`, and the
  i18n keys `devices.*` and `downloads.*`.
- Matches `devices.html` and `downloads.html`.

### Wave 5

**I. Dashboard, site and project cards** (agent, **Sonnet**)
- Owns the additions in `components/AdminDashboard`, `components/SiteManagement` and
  `components/ProjectDashboard` (Uploads/Devices cards, latest 8, per-day chart, attention).

**J. E2E** (agent, **Sonnet**)
- Owns `frontend/e2e/uploads-*.spec.ts` and the uploads part of `scripts/seed/e2e_seed.sql`
  (sessions plus a real fixture ZIP placed in the e2e `DATA_PATH`).
- Cases:
  - list scoping per persona
  - detail masks, reveal and edit (audit visible)
  - qc and comment
  - single download name
  - bundle selection rules
  - devices page
  - an upload through `/upload` appears as `valid`

### Wave 6

**K. Security and code review** (agent, **Opus**)
- Reviews ingest, permissions, downloads and the backup credentials handling. Findings are
  fixed by the lead.

**L. Docs** (agent, **Sonnet**)
- Updates:
  - `docs/newshare_changes.md` (phase B section, API table)
  - `docs/container_deployment.md` (nginx, systemd, `.env`, timer)
  - `backend/README.md`
  - this checklist

## 4. Progress checklist

- [x] Spec, plan and guidelines written
- [x] Local environment and baseline green (backend 235, frontend unit 83, e2e 58). One stale
  test was fixed, and `LOGIN_RATE_LIMIT` was added to `.env.test`.
- [x] Wave 0: schema, scope helpers (persona integration test on MariaDB), fixtures, fileStore,
  stubs. 283 backend tests green.
- [x] A ingest · [x] B validator/extractor (421 backend tests; real-DB smoke upload: valid,
  re-send, manifest mismatch and quarantine all behave per spec)
- [ ] C backup · [ ] D devices
- [ ] E read/review API · [ ] F downloads
- [ ] G uploads + session pages · [ ] H devices + downloads pages
- [ ] I dashboard cards · [ ] J e2e
- [ ] K review fixes · [ ] L docs
- [ ] End-to-end on the test container (spec §11, plan verification)

## 5. Verification (end-to-end)

1. Locally: `cd backend && npx vitest run`, then `cd frontend && npx vitest run && npx
   playwright test`.
2. Locally, against the real DB: start the backend, `curl -F` a fixture ZIP (and, if available,
   the real sample session) to `/upload` with the e2e site token, and check that it turns
   `valid` and that the UI shows it, plays its clips, downloads it, and bundles it.
3. Run `node src/runBackup.js all` with `BACKUP_TARGET=dir:<tmp>` and
   `BACKUP_DUMP_CMD="docker exec -i tp-mariadb mariadb-dump"`. Check that the `.sql.gz`
   restores into a scratch DB and that the session ZIP copies hash-match.
4. On the test container, after the user approves the deploy: run `npm run db:uploads`, apply
   the nginx and systemd changes, and repeat step 2 there.
