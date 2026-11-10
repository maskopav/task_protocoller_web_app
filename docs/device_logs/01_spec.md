# Device logs: specification

**Version 1.0, 2026-11-10. Status: implemented on web (2026-11-10).**

The NewShare desktop app sends its rotated log files to this server. A master reads them on the clinic page, per computer. This document is normative for both sides. The app-side summary is [`03_desktop_brief.md`](03_desktop_brief.md); if the two disagree, this document wins.

| Related document | Use |
|---|---|
| [`../upload_management/specification.md`](../upload_management/specification.md) | `/upload` conventions this endpoint copies: multipart order, tmp + atomic rename, idempotency |
| `NewShare/docs/dev/device-logs-contract.md` | App-side background: log files, rotation, what the logs contain |
| `backend/src/controllers/deviceController.js` | Device rule (`belongsToOtherSite`), reused here |

## 1. Decisions

| # | Decision |
|---|---|
| D1 | Only a **master** can list, view or download logs. Anyone else gets 404, as for quarantine. |
| D2 | The app sends **automatically**: rotated files only, after a config refresh and after an upload batch, never while a session is running. No periodic worker. |
| D3 | The server keeps logs for **90 days**, with a **total storage cap**. A purge runs at boot and every 24 h. |
| D4 | Transport is the same as `/upload`. There is no HTTPS work in this round. |
| D5 | Logs travel to the same secured server as session data. The app's existing log rules (spec §11 of NewShare) apply. **There is no new redaction** on either side. |
| D6 | Logs are **not** part of server backups. |
| D7 | Logs need a device that already belongs to the token's clinic. There is no quarantine for logs. The app's config refresh registers the device before any log is sent. |

## 2. Endpoint

```
POST /device-logs        (behind nginx: /api/device-logs)
Content-Type: multipart/form-data
```

The endpoint is public and gated by the site token. It is mounted **before** the JSON parsers, as `/upload` is. It has its own rate limiter (120 requests per 15 minutes per IP).

### 2.1 Parts

Text parts come first, in any order, and the `file` part comes **last**. An unknown part, a duplicated part, a missing part or a text part after `file` gives 400.

| Part | Required | Format | Meaning |
|---|---|---|---|
| `siteToken` | yes | `^[A-Za-z0-9_-]{16,64}$` | The clinic's credential |
| `installationId` | yes | `^[A-Za-z0-9-]{1,64}$` | The sending computer |
| `appVersion` | yes | 1–32 chars, no control chars | The sending build |
| `utcOffset` | yes | `^[+-]\d{2}:\d{2}$` | The computer's UTC offset at send time. Log timestamps are local with no offset. |
| `fileName` | yes | `^app\.\d{4}-\d{2}-\d{2}\.\d{1,3}\.log\.gz$` | The rotated file's name. It is stored and shown. |
| `sha256` | yes | `^[0-9a-f]{64}$` | SHA-256 of the file bytes. With the device, it is the idempotency key. |
| `file` | yes | one file part, ≤ `DEVICE_LOG_MAX_BYTES` | The gzip file as written by Logback. The client filename is ignored. |

### 2.2 Processing order

1. Parse the parts and validate their formats (400 `bad_request`). A `siteToken` that is present but malformed is answered like an unknown token: 404 `invalid_token`, so a mistyped token reads as "retry later". A missing `siteToken` is 400.
2. Stream `file` to `DATA_PATH/tmp/<uuid>.part`, hashing as it arrives. Exceeding the limit aborts with 413 `too_large`.
3. If the first two bytes are not `1f 8b`: 400 `not_gzip`. If the computed hash ≠ `sha256`: 400 `checksum_mismatch`.
4. Look up the token in `sites` with `access_token = ? AND is_active = 1`. If there is none: 404 `invalid_token`.
5. Look up the device by `installation_id`.
   - Unknown, or `site_id IS NULL`: 404 `device_not_registered`.
   - Belongs to another site (same rule as `belongsToOtherSite`): 409 `device_belongs_to_another_site`.
   - The endpoint never creates or adopts a device.
6. Idempotency: if a `device_logs` row already exists for (`device_id`, `sha256`), delete the tmp file and return 200 with the stored receipt plus `"duplicate": true`.
7. Commit: atomically rename to `DATA_PATH/device-logs/<device_id>/<sha256>.log.gz` and insert the row. A concurrent duplicate-key insert is treated as step 6.
8. Any other failure: 500 `internal`. The tmp file is always removed on failure.

Free-space (507) and rate-limit (429) checks are the same as for `/upload`.

### 2.3 Responses

| Code | Body | When | App's reading |
|---|---|---|---|
| 200 | `{"status":"ok","sha256":…,"bytes":…,"receivedAt":"ISO"}` (plus `"duplicate":true` on a resend) | Stored, or already stored | **Sent**: never send this file again |
| 400 | `{"error":"bad_request"\|"checksum_mismatch"\|"not_gzip"}` | Malformed request or file | **Unsendable**: never retry this file |
| 413 | `{"error":"too_large"}` | Over `DEVICE_LOG_MAX_BYTES` | **Unsendable** |
| 404 | `{"error":"invalid_token"\|"device_not_registered"}` | Bad, malformed or deactivated token, or the device has no clinic yet | **Retry later** |
| 409 | `{"error":"device_belongs_to_another_site"}` | The computer is filed under another clinic | **Retry later** |
| 429 / 5xx / no response | — | Temporary | **Retry later** |

## 3. Storage and data model

The file goes to `DATA_PATH/device-logs/<device_id>/<sha256>.log.gz`. It is immutable. `fileStore.js` gets a key rule for this layout; user input never forms a path, because the id comes from the DB and the hash is validated hex.

Added to `backend/scripts/schema/create_upload_tables.sql`:

```sql
CREATE TABLE IF NOT EXISTS `device_logs` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `device_id` integer NOT NULL,
  `site_id` integer DEFAULT NULL COMMENT 'Clinic at receipt time',
  `file_name` varchar(64) NOT NULL,
  `sha256` char(64) NOT NULL,
  `bytes` bigint NOT NULL,
  `utc_offset` char(6) NOT NULL,
  `app_version` varchar(32) NOT NULL,
  `received_at` datetime NOT NULL,
  UNIQUE KEY `device_logs_device_sha` (`device_id`, `sha256`),
  INDEX `device_logs_site_received` (`site_id`, `received_at`),
  INDEX `device_logs_received` (`received_at`),
  FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL
);
```

`.env` keys, with their defaults:

| Key | Default | Meaning |
|---|---|---|
| `DEVICE_LOG_MAX_BYTES` | `5242880` (5 MiB) | Per-file limit. It stays under nginx's 6 MB `/api/` body limit, so no new nginx location is needed. |
| `DEVICE_LOG_RETENTION_DAYS` | `90` | Age limit |
| `DEVICE_LOGS_MAX_BYTES` | `2147483648` (2 GiB) | Total cap over all stored logs |

## 4. Retention

The purge runs once at boot and then every 24 hours, and is also exported for tests.

1. Delete every row, and its file, with `received_at` older than `DEVICE_LOG_RETENTION_DAYS`.
2. While `SUM(bytes)` > `DEVICE_LOGS_MAX_BYTES`, delete the oldest rows (by `received_at`, then `id`) and their files.
3. A missing file is not an error: the row is still deleted.
4. The purge writes counts only to `system_log.txt`.

## 5. Admin API

The routes are mounted behind `requireAuth`. All of them are **master only**; a non-master gets 404.

| Route | Result |
|---|---|
| `GET /devices/logs?siteId=<id>` | `{"logs":[{"id","deviceId","deviceLabel","installationId","fileName","bytes","utcOffset","appVersion","receivedAt"}]}`, newest first. `siteId` is required. |
| `GET /devices/logs/:id/view` | The file decompressed, as `text/plain; charset=utf-8`, streamed |
| `GET /devices/logs/:id/download` | The `.gz` as `application/gzip`, with `Content-Disposition: attachment; filename="<fileName>"` |

- `view` and `download` accept the existing `?ticket=` auth, as session downloads do, so they open in a new tab.
- Each `view` or `download` writes an `audit_log` row (action `device_log_view` or `device_log_download`, with the log id).
- An unknown id gives 404.

## 6. UI

`ClinicPage.jsx` gets a `logs` tab in `TABS`. It is shown, and routable, only for a master; anyone else is redirected as for an unknown tab. It is modelled on `ClinicComputersTab.jsx`:

- Files are grouped by computer, with the label, falling back to the installation id.
- Within a computer, files are newest first, showing the file name, size, received time, UTC offset and app version.
- Each file has **View** (new tab, decompressed text) and **Download**.
- When there are no logs, the tab says so.

## 7. Server logging

Log lines name the route, the status and the `device_id` only. They never include the token, the file content or the client filename. This is the same rule as spec §7.3 of upload management.

## 8. Tests (required)

- **Integration** (vitest + supertest, test DB):
  - Every row of §2.3.
  - The resend gives 200 + `duplicate` with no second row or file.
  - The file lands at the §3 path.
  - A text part after `file` gives 400.
  - The tmp file is removed on every failure.
- **Purge:** a 91-day-old row and its file are deleted while an 89-day-old one stays; the cap deletes the oldest first; a missing file still drops the row.
- **Admin API:**
  - A non-master gets 404 on all three routes.
  - A master gets the list scoped to `siteId`, gunzipped text from `view`, and the `.gz` from `download`.
  - The audit rows are written.
- **Frontend** (vitest): the Logs tab shows for a master only, and lists the files grouped by computer.
