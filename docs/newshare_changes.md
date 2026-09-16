# `newshare` branch — sites-based deployment

This branch repurposes TaskProtocoller: protocols are no longer performed by
participants in the browser. Instead they are performed at **sites** (clinics)
running an external desktop application. A site authenticates with a stored
access token and fetches a config JSON containing every protocol it inherits
through its assigned projects. The participant layer is removed.

Result-data ingestion (the desktop app uploading session ZIPs) is **phase B**
— see the draft contract in [`desktop_upload_spec_draft.md`](./desktop_upload_spec_draft.md).

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
- `sites.config_json` is free-form site-level JSON echoed back verbatim in the
  config response (`site.config_json`). The web app validates that it parses,
  nothing more — its meaning belongs to the desktop app.
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
deactivated site, `200`:

```json
{
  "site": { "name": "Paris", "config_json": { "defaultLanguage": "fr" } },
  "projects": [
    {
      "id": 1,
      "name": "Project A",
      "protocols": [
        {
          "id": 12,
          "name": "PD-battery",
          "version": 3,
          "language_id": 2,
          "language_code": "fr",
          "randomization": { "strategy": "none" },
          "required_identifiers": [],
          "use_audio_guide": 0,
          "info_text": "", "instructions_text": "",
          "global_contents": [ { "type": "consent", "html": "<p>…</p>" } ],
          "tasks": [
            { "id": 100, "task_id": 2, "task_order": 1,
              "params": { "duration": 3, "syllable": "ta" }, "contents": [] }
          ]
        }
      ]
    }
  ]
}
```

Notes:
- The shape is the web app's **native** protocol serialization (same core as
  the admin editor fetch — both are built by `assembleProtocol()` in
  `protocolController.js`). Transforming to the desktop app's own config
  format is deliberately deferred until that spec stabilizes.
- A site with multiple projects gets one entry per project — the multi-project
  case is first-class. Language variants of a protocol appear as separate
  protocol entries (each `project_protocols` link is returned); the app picks
  by `language_code`.
- Only `is_active` projects and `is_current` protocol versions are returned.
  A project with no linked protocols is omitted.

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
  `projectDashboard.sitesTitle`/`noSites`/`stats.sites`); `cs`/`de` fall back
  to English as they already do for the management sections.

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
