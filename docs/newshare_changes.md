# `newshare` branch — sites-based deployment

This branch repurposes TaskProtocoller: protocols are no longer performed by
participants in the browser. Instead they are performed at **sites** (clinics)
running an external desktop application. A site authenticates with a stored
access token and fetches a config JSON containing every protocol it inherits
through its assigned projects. The participant layer is removed.

Result-data ingestion (the desktop app uploading session ZIPs) is **phase B**
— see [Phase B: upload management](#phase-b-upload-management) below and
[`upload_management/specification.md`](./upload_management/specification.md).

## Database schema

### New tables

```
sites          id, name (UNIQUE), description, country, contact_persons,
               contact_emails, access_token (char(64) UNIQUE),
               config_json (JSON), is_active, created_at/by, updated_at/by
site_projects  id, site_id, project_id, assigned_at
               UNIQUE (site_id, project_id); FKs ON DELETE CASCADE
user_sites     id, user_id, site_id, assigned_at
               UNIQUE (user_id, site_id); FKs ON DELETE CASCADE
```

- `user_sites` mirrors `user_projects`: it links admin users to the sites shown
  in the "Your Assigned Sites" dashboard section. Master sees all sites and
  needs no rows here.

- `sites.access_token` is the credential the desktop app stores and sends with
  its config request. Generated server-side (32 hex chars via
  `utils/tokenGenerator.js`), never editable, and never included in the config
  response body.
- `sites.config_json` holds the desktop app's settings (`defaultLanguage`,
  `languages`, `defaultMicName`, `defaultMicGain`, `enableEditor`,
  `indicatorType`, `useCalibration`), edited through a typed form in
  `SiteModal`. The backend type-checks known keys and strips unknown ones
  (`normalizeSiteSettings` in `utils/fieldValidation.js`); the mapping layer
  merges them into the top level of the config.
- `protocols.recordings_file_name` (clip filename template, must contain
  `${taskIndex}`) and `protocols.instructions_pdf_url` are the desktop-app
  protocol properties; `protocols.required_identifiers` now stores identifier
  objects `{name, catalogue, label, help, placeholder, regex, required}`
  (legacy string ids are still read and mapped onto the catalogue).
- Protocol inheritance is **derived, not stored**: a site's protocols are
  whatever its projects link to via the existing `project_protocols`. There is
  deliberately no `site_protocols` table.

### Removed tables

`participants`, `participant_protocols`, `sessions`, `session_environments`,
`recordings`, `session_mic_checks`, `task_results`, and the column
`project_protocols.access_token` (it only existed as the participant
enrollment link).

The results chain returns redesigned in phase B, parented to sites.

### Views

- Removed: `v_participant_protocols`, `v_quest_results`,
  `v_session_progress_detailed`, `v_session_summary`.
- Added: `v_site_protocols` — the site → project (active) → current-protocol
  spine (incl. `language_code`), used by the config endpoint and the admin
  site/project detail reads.
- Added: `v_user_site_assignments` — mirror of `v_user_project_assignments`,
  backs the user↔site assignment table on the admin-management page.
- Changed: `v_project_protocols` lost `access_token`;
  `v_project_summary_stats` lost all participant counts and gained
  `count_sites`.

**Migration note:** `create_views.sql` uses `CREATE OR REPLACE`, so removed
views would linger broken on an existing database. `drop_tables.sql` now
explicitly drops the removed views (and the removed tables), so a plain
`node src/runInit.js` migrates an existing dev database cleanly.

**SQL gotcha:** `runSqlFile.js` splits scripts naively on `;` — never put a
semicolon inside a string literal or comment in these SQL files.

## Backend API

### Removed routers

`/participants`, `/participant-protocols`, `/sessions`, `/recordings`,
`/task-results`, and the participant half of `/auth`
(`/auth/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`).
Dead utilities removed: `assignmentHelper.js`, `dateFormatter.js`, the
participant/QR email helpers in `emailService.js`. Dependencies removed:
`multer`, `qrcode`, `mariadb`.

### New: `GET /site-config/:token` (public)

The endpoint the desktop app calls. Gated by the site token; passes CORS with
no Origin header (server-to-server). Responses: `404` unknown token, `403`
deactivated site, `200` = the **desktop app's config format**
(`docs/ext_app_Task_Configuration_JSON_Spec.md`, decisions in
`docs/config_alignment_decision_table.md`):

```json
{
  "schemaVersion": 1,
  "configVersion": "2026-09-10.093000",
  "defaultLanguage": "cs", "languages": ["cs", "en"],
  "defaultMicName": "", "enableEditor": false,
  "indicatorType": "CIRCLE", "useCalibration": true,
  "protocols": [
    { "name": "PD-battery",
      "project": "Project A",
      "protocolInstructionsPdfUrl": "https://…/manual.pdf",
      "recordingsFileName": "${field.patient_code}_${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}",
      "patientFields": [ { "name": "patient_code", "labelKey": "p1_f_patient_code_label", "helpKey": "p1_f_patient_code_help", "placeholder": "HC001", "regex": "[A-Za-z0-9_-]+", "required": true } ],
      "tasks": [
        { "type": "VOCAL", "subtype": "SYLLABLES", "titleKey": "p1_t1_title", "instructionKeys": ["p1_t1_instr1"],
          "length": 3, "showIndicator": true, "canRepeat": true, "canSkip": false, "nrepetition": 1, "recordVideo": false }
      ] }
  ],
  "strings": { "cs": { "p1_t1_title": "…" }, "en": { "p1_t1_title": "…" } }
}
```

Notes:
- The handler only gathers native rows (`assembleProtocol()` per protocol,
  `tasks` ⨝ `task_types`); the transform is the pure `buildExtConfig()` in
  `src/utils/extConfig.js`, which also drives the fixture generator
  `scripts/gen-ext-configs.js` (→ `docs/ext_app_samples/*.json`, no DB).
- Language variants of a protocol (same `protocol_group_id`) are merged into
  one entry; each variant's texts go to `strings.<lang>`. Task texts come from
  the frontend i18n `tasks.json` files (`I18N_PATH` in prod, `frontend/src/i18n`
  in dev), with `{{placeholder}}` resolution and HTML → `<bold>`/`<italic>`
  conversion done server-side.
- Vision/cognitive tasks are skipped (logged as WARN); voice → `VOCAL`
  (+subtype), questionnaires → `QUESTIONNAIRE`. `CALIBRATION` is never emitted
  (`useCalibration` flag instead).
- Every `VOCAL` task carries `recordVideo` (real boolean; the voice task's
  "Also record video" checkbox, default off) so the app also films each take.
  It is never emitted on other task types.
- `audioExamplePath` is an absolute URL under `ASSET_BASE_URL` (new env var =
  public origin of the frontend build), only for the example files that exist.
- `protocols[]` is flat; each protocol names its parent project in `project`.
  A protocol linked to several of the site's projects appears once per project.
- Only `is_active` projects and `is_current` protocol versions are returned.

### New: `/sites` (admin, JWT required)

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/sites` | any admin | List sites (+`project_count`); `?project_id=` filters to one project's sites; `?userId=&role=` scopes to one admin's assigned sites via `user_sites` (master sees all) — the scoped rows never include `access_token`/`config_json` |
| GET | `/sites/:id` | any admin | Site detail + assigned projects + inherited protocols |
| POST | `/sites/create` | master | `{name, description, config_json}` — token generated server-side |
| PUT | `/sites/:id` | master | Update `{name, description, config_json, is_active}` |
| POST | `/sites/:id/projects` | master | Assign `{project_id}`; duplicate → 400 |
| DELETE | `/sites/:id/projects/:projectId` | master | Remove assignment |

`config_json` accepts an object or a JSON string; invalid JSON → 400.

### New: `/user-sites` (admin, JWT required)

Mirror of `/user-projects` — like it, mounted behind `requireAuth` only (no
per-route master gating; the UI exposes it only on the master-only
admin-management page):

| Method | Path | Purpose |
|---|---|---|
| GET | `/user-sites/user-sites` | List assignments (`v_user_site_assignments`) |
| POST | `/user-sites/assign-site` | Assign `{user_id, site_id}`; duplicate → 400 |
| DELETE | `/user-sites/remove-assignment/:id` | Remove by assignment id |

`sites`/`site_projects` are intentionally **not** in the public `/mappings`
allowlist — they carry access tokens and only travel over the authenticated
`/sites` API. `v_session_summary` was removed from the allowlist.

## Frontend

### Removed

- Participant routes (`/protocol/:token`, `/participant/:token`,
  `/participant/interface`, participant reset-password) and pages
  (`ParticipantAuthPage`, `ParticipantInterfaceLoader`,
  `ParticipantDashboardPage`, `components/Participants/*`).
- Enrollment modal (participant enrollment links/QR) from the protocol
  dashboard.
- API modules `participants.js`, `participantProtocols.js`; participant
  functions in `auth.js`.
- Project dashboard participant/fieldwork action cards and participant stats.
- **Flow settings / randomization** (button, modal, preview toggle,
  `utils/randomizer.ts`, testing badge). Tasks always run in the listed order.
  The `protocols.randomization` column is left in place but no longer written;
  `progressTracker` still reads a legacy strategy for progress counting only.
- The language picker on the protocol dashboard's "create protocol" card —
  languages are chosen in the protocol editor instead; new protocols start as
  `en`.

### Kept deliberately

- **Protocol preview**: `/participant/test` plus `ParticipantInterfacePage`
  and all task-execution components (Recorder, VisionTask, SDMT, hooks).
  Preview runs with no `sessionId`, so it never calls the removed
  session/recording endpoints.
- **Fieldwork components** (`ProjectFieldworkPage`, `components/Fieldwork/*`)
  stay in the tree with their route unmounted — they will be reworked in
  phase B to browse data uploaded by the desktop app.

### New

- `/admin/site-management` (master-only card on the admin dashboard):
  site table with token copy, create/edit modal (raw `config_json` textarea
  with JSON validation), and a manage-projects modal (assign/remove). Acts as
  the global site overview, parallel to "Project Management".
- Admin dashboard: "Your Assigned Sites" card grid (`SiteGrid`) above
  "Your Assigned Projects", fed by `GET /sites?userId=&role=`. Cards link to
  the new site detail page.
- `/admin/sites/:siteId` (`SiteDashboardPage`) — per-site mirror of the
  project dashboard with roles reversed: site metadata + status, stats
  (assigned projects / inherited protocols, both from the single
  `GET /sites/:id` response), and a clickable assigned-projects table linking
  to each project's dashboard. Master additionally gets an edit button reusing
  the existing `SiteModal`.
- Admin-management page: user↔site assignment UI mirroring the user↔project
  flow (`AssignSiteModal`, `UserSiteTable`, a per-user 🏥 assign button).
- Project dashboard shows the sites assigned to the project and a
  `count_sites` stat.
- New API modules `src/api/sites.js` and `src/api/userSites.js`
  (authenticated `apiFetch`).
- i18n: new keys only in `en/admin.json`
  (`adminDashboard.masterTools.sites*`, `management.siteManagement.*`,
  `projectDashboard.sitesTitle`/`noSites`/`stats.sites`,
  `protocolEditor.fileName.*`, `protocolEditor.identifiersButton`);
  `cs`/`de` fall back to English as they already do for the management
  sections.
- Protocol editor layout: the identifiers editor opens from a `🪪 Identifiers`
  button in the right-hand button block (where Flow Settings used to be), and
  the chosen identifiers are listed in a read-only table under the
  description. The recording filename is no longer a free-text field —
  `FileNameModal` offers a checkbox/drag table of the available variables and
  identifiers, an editable template line (any table edit reformats it as
  tokens joined by `_`) and a rendered example, both also shown in the
  current-protocol column.

## Tests

- **Backend unit** (`cd backend && npm test`, Vitest):
  `src/controllers/siteController.test.js` covers the config shape (grouping
  by project), 404/403 token handling, token non-leakage, create validation
  (token format, invalid `config_json`), duplicate-assignment mapping, and
  the `getSites` user scoping (joins `user_sites`, never selects the token).
  `src/controllers/userSiteController.test.js` covers the assignment
  endpoints (list / duplicate → 400 / remove).
- **E2E** (`cd frontend && npm run test:e2e`, Playwright):
  - `site-config.spec.ts` — fetches the config with the fixed seed token
    (`e2e2e2e2…` from `backend/scripts/seed/e2e_seed.sql`), asserts the
    inherited protocol and that the token never appears in the body.
  - `admin-route-matrix.spec.ts` — `/sites/*` and `/user-sites/*` require a
    JWT; `/site-config` stays public.
  - `admin-cors.spec.ts` — `/site-config` reachable with no Origin header.
  - `mappings-security.spec.ts` — retargeted off the removed `participants`
    table.
  - `participant-flow.spec.ts` deleted.
- E2E needs `backend/.env.test` (gitignored). Required keys:

  ```env
  DB_HOST=127.0.0.1
  DB_USER=root
  DB_PASSWORD=...
  DB_NAME=task_protocoller_test   # a disposable database — db:test:reset drops everything
  PORT=3001
  CORS_ORIGIN=https://localhost:5183
  JWT_SECRET=any-long-random-string
  LOGIN_RATE_LIMIT=50   # raises /auth/admin/login's rate limit (prod default: 10 per 15 min)
                        # so the full E2E suite's many real logins don't trip its own brute-force guard
  ```

## Seeds

- `artificial_data.sql` seeds two projects and two sites: Paris (projects 1+2,
  exercising the multi-project case) and London (project 1), with fixed
  human-readable tokens for local testing. It also assigns admin@test.com to
  Paris via `user_sites` so the user-scoped dashboard list is testable.
- `e2e_participant_seed.sql` → renamed `e2e_seed.sql`: same protocol fixture,
  now linked to an "E2E Site" with the fixed token the Playwright specs use.

## Project & site attribute cleanup (follow-up)

`projects` dropped `frequency` and renamed `country` -> `countries`,
`contact_person` -> `contact_persons`, gaining `contact_emails`. `sites` gained
`country`, `contact_persons`, `contact_emails`. All are comma-separated free
text in a single column — no JSON, no child tables. `v_project_summary_stats`
lost `frequency`/`contact_person` and gained `countries`; no consumer read the
dropped two.

`sites.access_token` is now admin-editable in `SiteModal`. `updateSite` uses
`access_token = IFNULL(?, access_token)` (and the same for the three new site
columns) because `SiteManagementPage`'s activate/deactivate button re-posts a
partial payload — under the previous full-overwrite semantics that would have
nulled a `NOT NULL UNIQUE` credential and locked out the desktop app. Format is
validated in `backend/src/utils/fieldValidation.js` as 16-64 chars of
`[A-Za-z0-9_-]`: deliberately wider than the generator's 32-hex output, because
the seeded tokens (`paris000...`) are alphanumeric but not hex.

**`/mappings` is no longer public.** Its old comment claimed it could not be
gated because `MappingProvider` loads before login, but every `useMappings()`
consumer sits inside `ProtectedRoute`. It is now mounted with `requireAuth`;
`api/mappings.js` switched from bare `fetch` to `apiFetch` (it needs the Bearer
token) and `MappingProvider` waits for a logged-in user. This mattered because
the route is a `SELECT *` dump, so `contact_emails` would otherwise have been
world-readable. Residual: any authenticated admin can still dump all projects,
bypassing the per-user `user_projects` scoping in `getProjectList`.

**Migration note:** same as above — no incremental migrations, so a plain
`node src/runInit.js` rebuilds and reseeds.

## Voice-task instructions: two cards (2026-10-09)

Voice tasks in `tasks.json` now carry exactly `instructions1` and `instructions2`,
one per desktop-app instruction card (`<strong>` = read to the participant,
`<em>` = examiner note). `instructionsActive` / `instructionsTopic` /
`instructionsPreCalibration` / `instructionsPostCalibration` are gone, along with
the web preview's topic-reveal button. `extConfig.js` emits one instruction key
per card, inner paragraphs joined with `\n\n`. The reading passage is no longer
emitted (it is handed out on paper); it stays in `tasks.json` for the web
preview. `dynamic_monologue` was removed and `pictureDescription` (VOCAL /
`PICTURE_DESCRIPTION`) added in its seed slot (id 10). The protocol editor's task modal
previews both cards. Questionnaires, sdmt and d15colour are unchanged.

---

## Phase B: upload management

The desktop app uploads one session ZIP per request. The server stores it, validates it,
extracts the metadata the UI needs, and lets admins browse, review, play and download it.
Normative documents: [`upload_management/specification.md`](./upload_management/specification.md)
(what), [`implementation_plan.md`](./upload_management/implementation_plan.md) (order, progress)
and [`guidelines.md`](./upload_management/guidelines.md) (how).

### New tables

All are created by `scripts/schema/create_upload_tables.sql` (`CREATE TABLE IF NOT EXISTS`).
`runInit.js` runs it after `create_tables.sql`. `npm run db:uploads` runs it against an existing
database without data loss. `drop_tables.sql` drops them.

```
devices           id, installation_id (UNIQUE), site_id (NULL = unassigned), label, app_version,
                  last_config_version/at, last_seen_at, local_pending, local_failed, created_at
upload_sessions   id, session_id (CHAR 32, UNIQUE), device_id, site_id/project_id/protocol_id (NULL ok),
                  protocol_name, protocol_project, config_version, started/ended/processed/received_at,
                  duration_s, bytes, zip_sha256, storage_path,
                  status (validating|valid|invalid), invalid_reason, checks (JSON),
                  qc (unreviewed|ok|review|excluded), flags (JSON), task/clip counters,
                  patient_code, visit_number, participant_fields (JSON, personal data),
                  participant_edited_at, exam_summary (JSON), backed_up_at
upload_attempts   id, session_id (no FK: rejected attempts have no row), installation_id, at,
                  http_code, outcome, bytes, sha_declared, sha_computed, device_reported
session_comments  id, upload_session_id (CASCADE), user_id, text, is_system, created_at
audit_log         id, user_id, action (reveal|download|bundle|participant_edit|qc_change),
                  upload_session_id, details (JSON), created_at
backup_runs       id, kind (db|files), started/finished_at, status, target, artifact, bytes, items, error
```

- Metadata lives in MariaDB, the ZIPs on the filesystem. Same pool, same scope rules, one backup.
- `upload_sessions.checks` holds the server checks (`zip_checksum`, `archive`, `manifest`, `ids`,
  `device`, `config_version`, `complete`). `flags` holds the 11 issue keys of the UI (`recovered`,
  `interrupted`, `skipped`, `retakes`, `edited`, `outdated`, `late`, `duplicate`, `nonstdMic`,
  `nonstdCam`, `device`). "Needs attention" is derived, never stored.
- `upload_sessions.exam_summary` carries everything the detail page needs, so the page never opens
  the ZIP for metadata.

### Backend API

#### Public (no JWT)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/upload` | `siteToken` part (site token) | `multipart/form-data`, text parts before `zip`. Mounted **before** the JSON parsers. 300 requests per 15 min per IP. Codes below |
| POST | `/device-checkin` | `siteToken` in body | `{siteToken, installationId, appVersion, pending, failed}`. 200 `{status:"ok"}`, 400 `invalid_request`, 404 `invalid_token`. 120 requests per 15 min per IP |
| GET | `/site-config/:token` | site token | **Additions:** optional `?installationId=&appVersion=` upserts the device (site, app version, config version, last seen). Not created for an invalid token. A device that moves to another site's token is reassigned |

`POST /upload` parts: `installationId` (1-64 chars `[A-Za-z0-9-]`), `sessionId` (32 hex),
`zipSha256` (64 hex), optional `siteToken`, optional `appVersion` (up to 32 chars), then `zip`
(up to `UPLOAD_MAX_BYTES`). Unknown, duplicated or missing parts give 400.

| Code | `error` | Meaning |
|---|---|---|
| 200 | | Accepted, or re-sent with the same hash (original receipt, `duplicate` flag added) |
| 400 | `bad_request` / `checksum_mismatch` / `too_large` | Bad request or transfer. The temp file is deleted |
| 404 | `device_not_registered` | Stored in **quarantine** (no site). A master must assign the device |
| 409 | `session_exists` | Same `sessionId`, different bytes |
| 429 | | Rate limit |
| 500 | `internal` | Anything else |

The 200 body is `{status:"ok", sessionId, bytes, sha256, receivedAt}`. Validation runs after the
response, in a serial in-process queue. Rows still `validating` are re-enqueued at boot.

#### Admin (`Authorization: Bearer <JWT>`)

"See" and "edit" are defined under [Permissions](#permissions-phase-b).

| Method | Path | Rights | Purpose |
|---|---|---|---|
| GET | `/uploads` | see | List with filters, sort, paging (`pageSize` 10/25/50/100). Returns `rows`, `total`, `kpis`, `facets` |
| GET | `/uploads/export.csv` | see | Same filters, no paging, no masked fields, UTF-8 BOM, formula-injection escaping |
| GET | `/uploads/summary` | see | `?siteId=`/`?projectId=`/none, `?days=7..90`. Counts, last upload, per-day, by protocol, by site |
| GET | `/uploads/:sessionId` | see | Detail: checks, tasks, timeline, masked participant, comments, `canEdit`, prev/next (`?ctx=`) |
| GET | `/uploads/:sessionId/attempts` | see | Upload attempts, newest first |
| GET | `/uploads/:sessionId/comments` | see | |
| POST | `/uploads/:sessionId/comments` | edit | `{text}`, up to 2000 chars. 201 |
| PUT | `/uploads/:sessionId/qc` | edit | `{qc}`. System comment plus audit `qc_change` |
| POST | `/uploads/:sessionId/reveal` | edit | Full participant fields. Audit `reveal` |
| PATCH | `/uploads/:sessionId/participant` | edit | `{fields}`. Audit `participant_edit`, system comment (field names only) |
| POST | `/uploads/ticket` | any admin session | `{ticket}`: 5 min JWT for downloads only |
| GET | `/uploads/:sessionId/zip` | edit, session or ticket | 409 `validating` until validated. Audit `download` |
| GET | `/uploads/:sessionId/clips/*path` | edit, session or ticket | Streams a clip from the ZIP, supports `Range`. No audit |
| POST | `/uploads/download` | edit on every id, session or ticket | Bundle (zip64, store). Audit `bundle` |
| GET | `/devices` | see | Scoped, with derived health and backlog (hidden without a site grant) |
| PUT | `/devices/:id` | master | `{label}` |
| PUT | `/devices/:id/site` | master | `{siteId}`. Assigns the device and moves its quarantined sessions, which are re-validated |

Mount order in `server.js`: `/uploads/ticket`, then `/uploads` with `requireAuthOrTicket` (the
download router), then `/uploads` with `requireAuth` (list and review).

Downloads:
- **Single:** `Content-Disposition: attachment; filename="<sessionId>.zip"`. The client's original
  filename is never stored. If participant fields were edited, the response is a stored ZIP with
  `<sessionId>.zip` plus `<sessionId>.participant.json`. The archive on disk is never rewritten.
- **Clips:** only entries named in `exam_summary` (under `clips/`). Any other path is 404.
- **Bundle:** at most 200 sessions and 5 GB summed (413 `too_large`). An id that is out of edit
  scope or unknown gives 404, and any `validating` session gives 409. It contains each
  `<sessionId>.zip`, the participant sidecars and `sessions.csv`, and is named
  `uploads-<UTC stamp>.zip`.

Errors are `{error: "<code>"}`. Response shapes are in the specification's appendix.

### Permissions (phase B)

> The old `db:permissions` / `alter_permissions.sql` step no longer exists: the schema is recreated by `runInit.js` (`create_tables.sql`). Visibility is now by assigned clinics only (see `docs/ui_redesign/`).

| Rule | Behaviour |
|---|---|
| Visibility | Master sees all. Others: site in `user_sites`, or project in `user_projects` and the site allowed by `user_project_sites` (else all the project's clinics). A session with no matched project is visible through a site grant only |
| See | List, KPIs, facets, detail (masked), attempts, comments, device list |
| Edit | Master, a site grant, or `can_edit` on the project grant that makes the session visible. Covers ZIP, clips, bundle, reveal, participant edit, qc, comments |
| Out of scope | **404**, exactly like a nonexistent session. Lists, KPIs and facets are computed after scoping |
| Visible but read-only | **403** `forbidden` on write endpoints |
| Master only | Quarantined sessions, device rename, device site assignment |
| Masking | `GET /uploads/:id` returns only `patient_code` and `visit_number`. Other participant fields are `null` and named in `maskedKeys[]` |
| Audit | `reveal`, `download`, `bundle`, `participant_edit` (old and new values, DB only), `qc_change`. Clip playback is not audited |
| Logs | `logs/system_log.txt` never holds participant values, patient codes or upload filenames, only session ids and codes |

Helpers: `canSeeSession`, `canEditSession` and `scopeWhereClause` in `src/utils/accessScope.js`.
Loading a scoped session and writing audit rows is in `src/upload/sessionAccess.js`.

### Storage layout

```
DATA_PATH/
  tmp/<uuid>.part                       in-flight uploads, deleted on failure
  sessions/<id[0:2]>/<sessionId>.zip    accepted archives, immutable, never renamed
```

`tmp/` and `sessions/` must be on one filesystem (the commit is an atomic rename). The server
creates both at boot and refuses to start if `DATA_PATH` is unset or not writable. These ZIPs are
the only copy until the backup has run (see `container_deployment.md`, "Backups").

### Download tickets

`<audio>`, `<video>` and native browser downloads cannot send an `Authorization` header.

- `POST /uploads/ticket` (session token) returns a JWT with `purpose: "download"`, valid for 5 min.
- The download routes accept it as `?ticket=` or as a form field `ticket`.
- `requireAuth` rejects any token that has a purpose, so a leaked ticket can't act as a session or
  mint another ticket. The ticket is still checked against the account (active, `token_version`)
  and the session scope.
- The bundle is a plain `<form method="post">` (`ticket`, `sessionIds` comma-joined), so the browser
  streams it to disk. On an https page calling an http API that form sends `Origin: null`, so the
  CORS check exempts exactly `POST /uploads/download` without an `Authorization` header. The ticket
  authenticates it, and scripts can't read the response.
- Tickets appear in URLs, so keep them out of access logs (see `container_deployment.md`).

### Frontend

| Route | Page | Notes |
|---|---|---|
| `/admin/uploads` | `UploadsPage` | KPIs, filters, sortable table, attention, CSV export, bundle selection |
| `/admin/uploads/:sessionId` | `SessionDetailPage` | Checks, tasks and timeline, clip player, participant panel (reveal and edit), review and comments, attempts, prev/next |
| `/admin/uploads/devices` | `DevicesPage` | Health, backlog, rename and site assignment (master) |
| `/admin/uploads/downloads` | `DownloadsPage` | Bundle download form |

All four are behind `ProtectedRoute`. Upload cards (latest 8, per-day chart, attention) also appear
on the admin dashboard, the site page and the project page (`components/Uploads/cards`). Code is in
`frontend/src/components/Uploads`, API modules `src/api/uploads.js` and `devices.js`, i18n keys
`uploads.*`, `devices.*` and `downloads.*`. The pages follow `docs/upload_management/ui_design/`.

### Backup

`node src/runBackup.js [db|files|all]` (`npm run backup`) makes a nightly DB dump and an
incremental copy of the session ZIPs to a pluggable `BackupTarget` (the `dir:` target ships).
Details are in `container_deployment.md`, "Backups".

### Tests

- **Backend unit** (`cd backend && npm test`): ingest (`routes/upload.test.js`), validator and
  extractor (table-driven per fixture variant), ZIP reader, validation queue, `fileStore`, CSV,
  devices, downloads, read and review API, backup targets (shared contract suite), dumper and
  service. Fixtures come from `test/fixtures/buildSessionZip.js` (variants `valid`, `noMaster`,
  `edited`, `manifestHashMismatch`, `missingEntry`, `unlistedEntry`, `idMismatch`, `badJson`,
  `zipSlipName`, `recovered+interrupted`, `nonstdMic`, `oldConfig`).
- **Integration against MariaDB** (`test/integration/*.test.js`): `sessionScope` (four personas,
  quarantine) and `uploadList`. They use `test/helpers/testDb.js`, read `.env.test`, roll back
  every test, and skip with a message when the DB is unreachable.
- **E2E** (`cd frontend && npm run test:e2e`): `uploads-ingest`, `uploads-scoping`,
  `uploads-detail`, `uploads-downloads` and `uploads-z-devices`. Sessions are created through the
  real `POST /upload` path. They cover list scoping per persona, masks, reveal and edit (audit),
  qc and comments, the single download name, bundle selection rules, the devices page, and an upload
  that appears as `valid`. `.env.test` also needs `DATA_PATH` (a git-ignored folder under
  `backend/.data/`).

### Desktop app follow-ups (NewShare repo)

1. Send `siteToken` and `appVersion` as upload parts.
2. Send `installationId` and `appVersion` as query parameters on `GET /site-config/:token`.
3. Call `POST /device-checkin` after each config fetch and after each upload batch.
4. Treat `409 session_exists` as terminal (already on the server with different contents), not as
   something to retry. Today it reads as a retryable `ServerError`.
