# Device logs: desktop brief

**Audience:** NewShare (desktop app) developers.

**Status:** contract fixed 2026-11-10. Implemented on web (2026-11-10); the desktop app is not done yet.

**Normative text:** [`01_spec.md`](01_spec.md). If the two disagree, that spec wins.

## What to send

- **Only the rotated files** `${LOG_PATH}/app.<yyyy-MM-dd>.<n>.log.gz`. Never `app.log`, because Logback holds it open. Never `updater.log`.
- Send them **oldest first, one at a time**.
- Skip files modified in the last 60 s: Logback may still be compressing them. They are sent at a later trigger.
- Send them **automatically**:
  - after a successful config refresh (which includes the device check-in);
  - after an upload batch;
  - **never while a session is running**: stop before the next file once a session starts.
- Do nothing when there is no site token.

## Request

`POST {WEB_SERVER_BASE_URL}/device-logs`, `multipart/form-data`. Text parts go first and **`file` goes last**:

```
siteToken       site token from Settings
installationId  from settings.json
appVersion      build version
utcOffset       e.g. +01:00 (ZoneId.systemDefault() offset now)
fileName        app.2026-11-09.0.log.gz
sha256          lowercase hex of the file bytes
file            the .gz, application/gzip
```

## Reading the response

| Status | Result | Local record |
|---|---|---|
| 200 (incl. `duplicate`) | Sent | `sent` |
| 400, 413 | Unsendable | `unsendable`, never retried |
| 404, 409, 429, 5xx | Retry later | nothing recorded; the run ends, tried again at the next trigger |
| Transport error, unreadable file | Skip this file, try the next | nothing recorded; tried again at the next trigger |

## Local record

`config/device_logs_sent.json` maps `fileName` to `{sha256, state: "sent"|"unsendable"}`.
- If a file's hash differs from its recorded hash, treat it as a new file.
- Write the record atomically (temp file + move), as other app JSON is written.
- Drop entries whose file is no longer on disk. Logback deletes files after 14 days, so a computer that is offline longer loses them; this is accepted.

## App logging

Log counts and outcomes only, e.g. `device logs: 2 sent, 1 retry later`. Never the token, the `installationId` or a path. Exceptions go through `safeDescribe`.

## Compatibility

- An old server without the route returns 404, which means "retry later": harmless, and the files keep waiting.
- An old app never calls the route.
- No change to `/upload`, `/site-config` or `/device-checkin`.
