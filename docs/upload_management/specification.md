# Upload management (phase B): specification

Version 1.0, 2026-10-22. Status: approved for implementation.

This document is normative for the server side of phase B. The related documents are:

| Document | Role |
|---|---|
| `NewShare/docs/dev/upload_data.md` | What the desktop app sends: request parts, ZIP layout, JSON schemas. Cited below as **UD §n**. |
| `ui_design/*.html`, `ui_design/assets/{ui.js,mock-data.js}` | Approved UI. The enums in `ui.js` are the API vocabulary. |
| [`implementation_plan.md`](implementation_plan.md) | Waves, tasks, file ownership, progress. |
| [`guidelines.md`](guidelines.md) | Rules for anyone (human or agent) implementing this. |

---

## 1. Scope

In scope:

1. **Ingest.** The desktop app uploads one session per request. The server streams it to disk,
   verifies it, stores it immutably, and records every attempt.
2. **Validation and extraction.** The server checks the archive and extracts the metadata the
   UI needs, without unpacking media.
3. **Devices.** Installations register implicitly through the site token. The server tracks
   check-ins and backlog counts, and masters can rename devices.
4. **Browse and review.** This covers the uploads list, session detail, review status, comments,
   participant reveal and edit (audited), and dashboard, site and project aggregates.
5. **Downloads.** Single sessions, streaming clips for playback, multi-session bundles, and CSV
   export.
6. **Backup.** Periodic DB dump plus incremental copy of the session ZIPs to network storage.
   The storage access goes through a pluggable `BackupTarget` interface.
7. **Frontend** pages for all of the above, matching `ui_design/`.

Out of scope:

- Task-level repacked downloads ("under consideration" in the mockup).
- Retention or purge tooling.
- Deleting sessions.
- Re-validation buttons.
- Changes to the desktop app. They are listed in §12 as follow-ups for the NewShare repo.

## 2. Storage decision

**The metadata goes into the existing MariaDB database. The ZIPs go on the filesystem.**

- Every query joins to `sites`, `projects`, `protocols` and the scope tables. The visibility
  rule in `backend/src/utils/accessScope.js` works per (site, project) pair. A separate DB would
  either duplicate that rule or need cross-DB joins.
- The volume is small: one row per session plus a few rows per attempt or comment.
- One DB means one connection pool (`src/db/queryHelper.js`), one transaction boundary, one test
  pattern and one backup.
- The ZIPs (up to several hundred MB each) **never** go into the DB. Storing them there would
  bloat the dumps, slow down backups and force in-memory buffering.

The file layout under `DATA_PATH` is:

```
DATA_PATH/
  tmp/<uuid>.part                       in-flight uploads (deleted on failure)
  sessions/<id[0:2]>/<sessionId>.zip    accepted archives, immutable, never renamed
```

The client's filename (`<patientCode>_<sessionId>.zip`) contains participant data. It is
**never stored and never logged**. The stored name is `<sessionId>.zip`.

## 3. Upload contract (`POST /upload`)

The endpoint is public and authenticated by the site token. It is behind nginx at `/api/upload`.
It is rate-limited per IP, and it is mounted **before** the app-wide JSON and urlencoded parsers.

### 3.1 Request

`multipart/form-data`. The text parts must come **before** the `zip` part, which is what the
app's `KtorUploadApi` sends.

| Part | Required | Format |
|---|---|---|
| `installationId` | yes | 1–64 chars `[A-Za-z0-9-]` (UUID in practice; mock data also has `DEMO-002`) |
| `sessionId` | yes | `^[0-9a-f]{32}$` |
| `zipSha256` | yes | `^[0-9a-f]{64}$` |
| `siteToken` | phase B, optional until the app sends it | `sites.access_token` |
| `appVersion` | phase B, optional | ≤ 32 chars |
| `zip` | yes, last | `application/zip`, ≤ `UPLOAD_MAX_BYTES` (default 4 GiB) |

The server rejects unknown parts, duplicated parts, a missing part, or an oversized file with
`400`. In each case it deletes the temporary file.

### 3.2 Processing order

1. **Stream** the `zip` part to `tmp/<uuid>.part` and compute the SHA-256 while writing.
2. **Checksum.** If the computed hash differs from `zipSha256`, respond `400
   {error:"checksum_mismatch"}`, record the attempt (code 400), and delete the temporary file.
3. **Idempotency on `sessionId`.**
   - If the session already exists **with the same `zip_sha256`**, respond `200` with the
     **original receipt**. The attempt is recorded with outcome `resent`, `duplicate` is added
     to the session's flags, and the temporary file is deleted.
   - If it exists with a different hash, respond `409 {error:"session_exists"}`, record the
     attempt (409), and delete the temporary file.
4. **Device and site resolution.**
   - If `siteToken` matches an active site, upsert the device and set `devices.site_id` to that
     site. The session's site is that site.
   - If the token is missing but the device is known and has a site, use the device's site.
   - Otherwise (unknown device, or an invalid or inactive token), put the upload in
     **quarantine**. It is stored as usual, but `site_id` is NULL, `status` is `invalid`,
     `invalid_reason` is `unknown_device`, and the response is `404
     {error:"device_not_registered", quarantined:true}`. Only masters can see quarantined
     sessions.
5. **Commit.** Rename `tmp/…part` to `sessions/<id[0:2]>/<sessionId>.zip`. Both paths are on the
   same filesystem, so the rename is atomic. Insert the `upload_sessions` row with `status
   validating` (unless it is quarantined) and the `upload_attempts` row in a single transaction.
   If the insert fails because a concurrent request inserted the same `sessionId`, go back to
   step 3.
6. **Respond** `200`:
   ```json
   {"status":"ok","sessionId":"76a6…bd2f","bytes":239112233,"sha256":"…","receivedAt":"2026-10-13T08:01:02.123Z"}
   ```
   The app stores this body verbatim. It is the same shape the mock server used.
7. **Validation** of the session is enqueued (§4) and runs after the response has been sent.

Responses at a glance:

| Code | Body `error` | When | App's reading |
|---|---|---|---|
| 200 | — | accepted, or re-sent with the same hash | `Success` |
| 400 | `bad_request` / `checksum_mismatch` / `too_large` | malformed request or transfer | `ServerError` → retry later |
| 404 | `device_not_registered` | quarantined (stored, master must assign) | `Rejected` |
| 409 | `session_exists` | same id, different bytes | currently `ServerError`; app follow-up §12 |
| 429 | — | rate limit | `ServerError` |
| 500 | `internal` | anything else (temporary file removed) | `ServerError` |

### 3.3 Attempts

Every request that gets as far as parsing a valid `sessionId` writes an `upload_attempts` row
(`at, http_code, outcome, bytes, sha_declared, sha_computed, installation_id`). The outcome is
one of `accepted`, `resent`, `checksum`, `conflict`, `quarantined`, `error`.
`device_reported=1` rows (code `0`, "no request reached the server") come from device check-in
in a later client version. The column exists now, but nothing writes to it yet.

## 4. Validation and extraction

An in-process serial queue (`upload/validationQueue.js`) processes one session at a time. At
startup it re-enqueues every row that is still `validating`, so it recovers from crashes. A
validation only updates the row. It never moves or modifies the ZIP.

### 4.1 Server checks (`archiveValidator`)

The validator reads the ZIP with `yauzl` and does not extract it to disk. Each check yields
`{key, result: ok|bad|warn|skip, detail}`, and the list is stored in `upload_sessions.checks`.

| key (UI label) | Rule | On failure |
|---|---|---|
| `zip_checksum` ("ZIP checksum") | Already verified at ingest. Recorded as `ok`. | (rejected at ingest) |
| `archive` ("Malformed archive") | The ZIP opens. Entry names are relative, use `/`, contain no `..`, have no leading `/`, and are not directories. Entry count ≤ 10 000. Uncompressed/compressed ratio ≤ 200 per entry. `manifest.json`, `examination.json`, `participant.json`, `task_configuration_snapshot.json` and `timeline_original.json` exist and parse as JSON. | `invalid`, reason `malformed` |
| `manifest` ("Manifest file hashes") | Every `files[]` entry exists and the SHA-256 of its uncompressed bytes matches. Every ZIP entry except `manifest.json` is listed. | `invalid`, reason `manifest` |
| `ids` ("IDs consistent") | `sessionId` is the same in the form, `manifest.sessionId`, `examination.sessionId` and (if present) the timelines. `installationId` is the same in the form and in `examination.installationId`. | `invalid`, reason `malformed` |
| `device` ("Device registered") | The session has a site. | `bad`. The reason is already `unknown_device` (quarantine). |
| `config_version` ("Config version") | `manifest.configVersion` = `examination.configVersion`. If both are older than the site's current config version, the check is a `warn` and the session gets the `outdated` flag. | mismatch → `invalid`, reason `malformed` |
| `complete` ("Session complete") | `endedAt` is present, and no expected task instance is missing. | `warn` only |

A session is `valid` when no check is `bad`. The first failing check, in table order,
determines `invalid_reason`.

### 4.2 Extraction (`sessionExtractor`, pure function)

The input is the parsed JSON files plus context (`receivedAt`, the site's projects and
protocols, the current config version). Defaults from UD §6 apply: a missing `version` is 1, a
missing boolean is false, a missing list is `[]`, and a missing count is 0. Unknown keys are
ignored.

**Row fields:**
- `started_at`, `ended_at`, and `processed_at` (from `processing.processedAt`).
- `duration_s` is `endedAt − startedAt`, or `processedAt − startedAt` when `endedAt` is
  absent.
- `config_version`, `protocol_name`, `timeline_used`, `recovered`, and `interruptions` (the
  count).
- `has_audio` is true when `captureFormat` is not null.
- `audio_clips` counts `tasks[].clipFile` and `video_clips` counts `tasks[].videoFile`.
- `project_id` comes from matching `protocolProject` against `projects.name` among the site's
  projects.
- `protocol_id` comes from matching `protocolName` against `protocols.name` within that
  project. Either is NULL when unmatched, which is allowed and shown as text.

**Participant:**
- `patient_code` is `fields.patient_code` and `visit_number` is `fields.visit_number`.
- `participant_fields` holds all of `fields` as JSON. It is treated as **personal data** (§7.3).

**Task results:**
- The snapshot protocol is found by `name`+`project`. Its tasks, each repeated `nrepetition`
  times, give the expected instances.
- Each expected instance gets a result: `Done` if it is present and not skipped, `Skipped` if
  `skipped`, and `Missing` if it is absent from `examination.tasks[]`.
- `tasks_total` is the number of expected instances, `tasks_done` the number of `Done`, and
  `tasks_skipped` the number of `Skipped`.
- If the snapshot can't be resolved, the expected set is `examination.tasks[]` itself.

**`exam_summary` JSON** contains everything the detail page needs, so it never has to open the
ZIP for metadata:
- `tasks[]` with result, takes, clipFile, videoFile and questionnaireAnswers
- `captureFormat`, `hardware`, `interruptions[]`, `videoTakes[]`
- timeline segments: per instance, the kept take's `[start, stop]` sample range plus rejected
  takes with their reason, taken from `timeline_original` or `timeline_edited`
- `sampleRate`

**Flags** go in the `flags` JSON array. The keys are exactly those in `ui.js`'s `ISSUES`:

| Flag | Rule |
|---|---|
| `recovered` | `examination.recovered` |
| `interrupted` | `interruptions.length > 0` |
| `skipped` | any task has `skipped` |
| `retakes` | any task has `takes > 1` |
| `edited` | `processing.timelineUsed == "edited"` |
| `outdated` | `configVersion` < the site's current config version (string compare; the format `YYYY-MM-DD.HHMMSS` sorts) |
| `late` | `receivedAt − (endedAt ?? processedAt) > 72 h` |
| `duplicate` | set at ingest on a same-hash re-send (§3.2) |
| `nonstdMic` | `micUses` is non-empty, `configuredMicDeviceId` is set, and **every** `micUses[].deviceId ≠ configuredMicDeviceId` |
| `nonstdCam` | the same rule for cameras |
| `device` | `hardware.events` contains an `interrupted` or `capture_failed` event |

`needsAttention` is derived and never stored: `status = invalid`, OR `qc = review`, OR any flag
in {recovered, interrupted, nonstdMic, nonstdCam}.

## 5. Data model

All of the following are new tables. They are defined in `scripts/schema/create_tables.sql`
for fresh installs. The idempotent `scripts/schema/alter_uploads.sql` (`npm run db:uploads`)
adds them to existing databases, and `drop_tables.sql` drops them.

```sql
devices (
  id PK, installation_id VARCHAR(64) UNIQUE NOT NULL, site_id NULL FK sites,
  label VARCHAR(255) NULL, app_version VARCHAR(32) NULL,
  last_config_version VARCHAR(32) NULL, last_config_at TIMESTAMP NULL,
  last_seen_at TIMESTAMP NULL, local_pending INT NOT NULL DEFAULT 0, local_failed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

upload_sessions (
  id PK, session_id CHAR(32) UNIQUE NOT NULL, device_id FK devices NOT NULL,
  site_id NULL FK sites, project_id NULL FK projects, protocol_id NULL FK protocols,
  protocol_name VARCHAR(100), protocol_project VARCHAR(255), config_version VARCHAR(32), app_version VARCHAR(32),
  started_at, ended_at NULL, processed_at NULL, received_at NOT NULL,      -- DATETIME(3), UTC
  duration_s INT NULL, bytes BIGINT NOT NULL, zip_sha256 CHAR(64) NOT NULL, storage_path VARCHAR(255) NOT NULL,
  status ENUM('validating','valid','invalid') NOT NULL,
  invalid_reason ENUM('checksum','manifest','malformed','unknown_device') NULL,
  checks JSON NULL, qc ENUM('unreviewed','ok','review','excluded') NOT NULL DEFAULT 'unreviewed',
  flags JSON NOT NULL DEFAULT '[]',
  tasks_total INT, tasks_done INT, tasks_skipped INT, audio_clips INT, video_clips INT,
  has_audio BOOL, recovered BOOL, interruptions INT, timeline_used ENUM('original','edited'),
  patient_code VARCHAR(255) NULL, visit_number VARCHAR(64) NULL,
  participant_fields JSON NULL, participant_edited_at TIMESTAMP NULL,
  exam_summary JSON NULL, backed_up_at TIMESTAMP NULL)
  INDEX (site_id, received_at), (project_id, received_at), (status), (qc), (patient_code)

upload_attempts (id PK, session_id CHAR(32), installation_id VARCHAR(64), at DATETIME(3),
  http_code SMALLINT, outcome VARCHAR(16), bytes BIGINT NULL, sha_declared CHAR(64) NULL,
  sha_computed CHAR(64) NULL, device_reported BOOL DEFAULT 0)  INDEX (session_id)

session_comments (id PK, upload_session_id FK CASCADE, user_id NULL FK users, text TEXT,
  is_system BOOL, created_at)

audit_log (id PK, user_id FK users, action ENUM('reveal','download','bundle','participant_edit','qc_change'),
  upload_session_id NULL FK, details JSON, created_at)

backup_runs (id PK, kind ENUM('db','files'), started_at, finished_at NULL,
  status ENUM('running','ok','failed'), target VARCHAR(255), artifact VARCHAR(255) NULL,
  bytes BIGINT NULL, items INT NULL, error TEXT NULL)
```

`upload_attempts.session_id` has no FK on purpose: rejected attempts have no session row.

## 6. Devices

- **Implicit registration.** `GET /site-config/:token` accepts the optional query parameters
  `installationId` and `appVersion`. On a successful token lookup the server upserts
  `devices(installation_id)` with `site_id`, `app_version`, `last_config_version`,
  `last_config_at` and `last_seen_at`.
  - The device is not created when the token is invalid.
  - A device that moves to another site's token is reassigned, which is the latest-wins rule.
- **Check-in.** `POST /device-checkin {siteToken, installationId, appVersion, pending, failed}`
  is public and rate-limited. It updates `last_seen_at`, `app_version`, `local_pending` and
  `local_failed`. It returns 404 for a bad token.
- **Health** is derived in the API and matches `deviceHealth` in `ui.js`:
  - `bad`: last seen more than 7 days ago
  - `warn`: there is a backlog
  - `ok`: otherwise
  - `off`: no uploads, or no uploads in the caller's scope
- **Admin.**
  - `GET /devices` is scoped by the device's site.
  - Backlog counts are visible only with a site grant or as master. Otherwise they are 0 and
    `backlogHidden: true`.
  - `PUT /devices/:id {label}` is master only.
  - `PUT /devices/:id/site {siteId}` is master only. It assigns a quarantined device, and that
    device's quarantined sessions move to the site and are re-validated. This is the "master
    assigns it" action the mockup text refers to.

## 7. Permissions

### 7.1 Helpers (in `utils/accessScope.js`)

```js
canSeeSession(admin, {site_id, project_id})   // master: always. Quarantined (site_id NULL): master only.
                                              // else: site ∈ user_sites, OR project ∈ user_projects and
                                              // site allowed for it (user_project_sites whitelist, else all
                                              // of the project's clinics)
canEditSession(admin, row)                    // master, OR site ∈ user_sites, OR can_edit on the project
                                              // grant that makes it visible
scopeWhereClause(admin, alias = 'us')         // → { sql, params } for list/aggregate queries
```

A session whose `project_id` is NULL (unmatched project) is visible through a site grant only.

### 7.2 Rules

- Out of scope behaves exactly like nonexistent: **404**, everywhere.
- Lists, KPIs, filter options, counts and aggregates are all computed server-side **after**
  scoping.
- "Edit" covers downloading the ZIP, bundles, clips, reveal, participant edit, qc change and
  comments. "See" covers the list, the masked detail and attempts.
- Master only: quarantined sessions, device rename and site assignment.

### 7.3 Personal data

- `GET /uploads/:id` returns `participant.fields` with only `patient_code` and `visit_number`
  shown. Every other value is `null`, and a `maskedKeys[]` list names the hidden fields.
- `POST /uploads/:id/reveal` requires edit rights. It returns the full fields and writes an
  `audit_log(reveal)` entry.
- `PATCH /uploads/:id/participant {fields}` requires edit rights.
  - `patient_code` and `visit_number` cannot be blanked, and values must be strings ≤ 255
    characters.
  - It writes one audit entry with `details.changes = [{field, old, new}]`. Because these are
    personal values, that table is DB only and is never written to log files.
  - It posts a system comment "edited participant fields: a, b" (field names only), and sets
    `participant_edited_at`.
- Log files (`logs/system_log.txt`) **never** contain participant values, the patient code or
  the upload filename. They contain `sessionId` and HTTP codes only.

## 8. Admin API (all behind `requireAuth`)

| Method | Path | Rights | Notes |
|---|---|---|---|
| GET | `/uploads` | see | Query: `q` (patient code / session id prefix / device id / label), `site[]`, `project`, `protocol`, `dateField=received\|recorded`, `from`, `to`, `status`, `qc`, `flag[]` (AND), `hasVideo`, `attention`, `sort`, `dir`, `page`, `pageSize∈{10,25,50,100}`. Returns `{rows, total, kpis, facets:{sites:[{id,count}], flags:[{key,count}]}}`. |
| GET | `/uploads/export.csv` | see | Same filters. Columns are those of the list. No masked fields. |
| GET | `/uploads/summary` | see | `?siteId=` / `?projectId=` / none (dashboard). Returns counts (week, 30 d, invalid, needs review, attention), lastUpload, per-day series `?days=7..90`, and by-protocol and by-site counts. |
| GET | `/uploads/:sessionId` | see | Row + `exam_summary` + checks + masked participant + `canEdit` + prev/next ids under the same filters (passed back as `?ctx=`). |
| GET | `/uploads/:sessionId/attempts` | see | |
| POST | `/uploads/:sessionId/reveal` | edit | audited |
| PATCH | `/uploads/:sessionId/participant` | edit | audited, system comment |
| PUT | `/uploads/:sessionId/qc` | edit | `{qc}`. Posts the system comment "set review to X". Audit `qc_change`. |
| GET / POST | `/uploads/:sessionId/comments` | see / edit | `{text}` ≤ 2000 chars |
| GET | `/uploads/:sessionId/zip` | edit | §9 |
| GET | `/uploads/:sessionId/clips/*path` | edit | §9 |
| POST | `/uploads/download` | edit (every id) | §9 |
| GET | `/devices` | see | scoped, health, backlog rule (§6) |
| PUT | `/devices/:id` | master | `{label}` |
| PUT | `/devices/:id/site` | master | `{siteId}` |
| GET | `/backups/status` | master | the latest `backup_runs` per kind (for the master dashboard tile; optional UI) |

Sort keys: `receivedAt, site, patient, protocol, endedAt, durationS, bytes, status, qc`. Two keys
use a semantic order instead of alphabetical:
- `status`: invalid < validating < valid
- `qc`: review < unreviewed < ok < excluded

Dates in responses are ISO-8601 UTC.

## 9. Downloads

- **Single session.** `GET /uploads/:id/zip` returns `409` while the session is `validating`.
  It streams `sessions/…/<id>.zip` with `Content-Disposition: attachment;
  filename="<sessionId>.zip"`.
  - If `participant_edited_at` is set, it instead streams a *stored* (uncompressed) ZIP
    containing `<sessionId>.zip` and the sidecar `<sessionId>.participant.json`, which holds
    the current fields.
  - The original archive is never rewritten, so its manifest stays verifiable.
  - Every download writes an audit entry (`download`).
- **Clips.** `GET /uploads/:id/clips/<entry path>` only serves entries named in
  `exam_summary.tasks[].clipFile/videoFile`. Any other path is a 404.
  - It streams the inflated entry with `Content-Type` `audio/wav` or `video/mp4`.
  - It supports `Range: bytes=a-b` by inflating and discarding bytes up to `a`. This is
    acceptable for the expected traffic.
  - It writes no audit entry: playback is not a download.
- **Bundle.** `POST /uploads/download {sessionIds:[…]}`:
  - If any id fails `canEditSession` or doesn't exist, the whole request returns 404. If any
    session is `validating`, it returns 409.
  - The limit is ≤ 200 sessions and ≤ 5 GB of summed `bytes`. Above that it returns 413 with
    `{error:"too_large"}`.
  - It streams a zip64 archive (`archiver`, store mode, no recompression) containing:
    - `<sessionId>.zip` for each session
    - `<sessionId>.participant.json` for each edited session
    - `sessions.csv`, with columns sessionId, patient_code, visit_number, protocol, project,
      site, recordedAt, receivedAt, status, qc, flags (`;`-joined)
  - It writes one `bundle` audit entry listing the ids.
- **CSV export.** This is the list export (§8) and is separate from the bundle.

## 10. Backup

### 10.1 Interfaces

The network storage protocol is not known yet. All code depends only on these interfaces
(JSDoc, `backend/src/backup/`):

```js
/**
 * @interface BackupTarget
 * put(name, readable)  -> Promise<{ bytes }>       Atomic: `name` is never visible half-written.
 *                                                  Overwrites an existing `name`.
 * list(prefix = '')    -> Promise<{ name, bytes, modifiedAt }[]>
 * remove(name)         -> Promise<void>            No error if absent.
 * describe()           -> string                   Human-readable, no secrets (stored in backup_runs.target).
 * Names are relative, '/'-separated, [A-Za-z0-9._/-]. No '..'.
 */

/**
 * @interface DatabaseDumper
 * dump() -> Readable   SQL text of the whole database; the stream errors if the dump fails.
 */
```

The implementations shipped in phase B are:

| Class | Use |
|---|---|
| `MemoryBackupTarget` | tests |
| `DirectoryBackupTarget(root)` | writes `<name>.part` → fsync → rename. Works as-is if the network storage is mounted (NFS/SMB/CIFS). |
| `MariaDbDumper({cmd, args, env})` | spawns `mariadb-dump --single-transaction --routines --triggers <db>`. Credentials go through a temporary `--defaults-extra-file` (mode 600), never argv. `BACKUP_DUMP_CMD` overrides the binary, e.g. `docker exec -i tp-mariadb mariadb-dump` locally. |

`backend/src/backup/backupTargetContract.js` exports a vitest suite that takes a factory. Every
`BackupTarget` implementation must pass it, and so must future SFTP, S3 or WebDAV targets.

### 10.2 Service and schedule

`backupService` gets `{target, dumper, store, db, clock}` injected.

- `runDbBackup()` streams `dumper.dump()` through gzip to `db/<UTC yyyymmdd-HHMMss>.sql.gz`.
  It then applies retention: it keeps the newest `BACKUP_DB_KEEP` dumps (default 14) and
  removes the older ones.
- `runFileBackup()` handles every `upload_sessions` row that has `backed_up_at IS NULL` and
  `status <> 'validating'`:
  1. Copy the ZIP with `put('sessions/<id[0:2]>/<id>.zip')`.
  2. Read it back through `list` and check the size.
  3. Set `backed_up_at`.

  ZIPs are immutable, so this is incremental by construction and is never pruned.
- Each run inserts a `backup_runs` row (`running` → `ok`/`failed`, with bytes, items and error).
  A failure in one session does not stop the others. It is counted, and the run ends as
  `failed`.
- `node src/runBackup.js [db|files|all]` is the CLI. It is scheduled by a systemd timer, nightly
  for `all`. The target comes from `BACKUP_TARGET`:
  - `dir:/mnt/backup` selects `DirectoryBackupTarget`.
  - Future schemes are registered in `backup/targetFactory.js`.
  - An unknown scheme makes the CLI exit with code 2.

## 11. Configuration and deployment

New `.env` keys:

```
DATA_PATH=/srv/task-protocoller/data      # must be one filesystem (atomic rename tmp → sessions)
UPLOAD_MAX_BYTES=4294967296
BACKUP_TARGET=dir:/mnt/backup/task-protocoller
BACKUP_DB_KEEP=14
BACKUP_DUMP_CMD=                          # optional override, default "mariadb-dump"
```

The server refuses to start if `DATA_PATH` is unset or not writable.

- **nginx.** Add an `/api/upload` location with `client_max_body_size 4g`,
  `proxy_request_buffering off`, `proxy_read_timeout 600s` and `proxy_send_timeout 600s`.
  Downloads need `proxy_buffering off` on `/api/uploads/` for large streams.
- **systemd.**
  - Add `ReadWritePaths=` for `DATA_PATH` and the backup mount.
  - Add a `task-protocoller-backup.service` (oneshot) and a `.timer` (`OnCalendar=*-*-* 02:30`).
- **Existing database.** Run `npm run db:uploads` to add the tables without data loss.

## 12. Follow-ups for the desktop app (NewShare repo)

1. Send `siteToken` and `appVersion` as upload parts.
2. Send `installationId` and `appVersion` as query parameters on `GET /site-config/:token`.
3. Call `POST /device-checkin` after each config fetch and after each upload batch.
4. Treat `409 session_exists` as terminal ("already on the server with different contents"),
   not as something to retry.
