# Device logs: web results

**2026-11-10.** Server side and Logs tab of [`01_spec.md`](01_spec.md) are implemented on web. The desktop app is not part of this round.

## Built

| Spec | Where |
|---|---|
| §2 `POST /device-logs` | `backend/src/routes/deviceLogs.js`, `backend/src/deviceLogs/ingest.js`; the receiver is shared with `/upload` (`receiveDeviceLog` in `upload/multipartReceiver.js`, which now wraps one generic `receiveMultipart`) |
| §2 limiter | `createDeviceLogLimiter` (120 / 15 min / IP) in `middleware/rateLimiter.js` |
| §3 storage, table, env | `LocalFileStore.deviceLogKey/remove`, `device_logs` in `create_upload_tables.sql` (and `drop_tables.sql`), `loadUploadConfig().deviceLogs` |
| §4 purge | `backend/src/deviceLogs/purge.js` (`purgeDeviceLogs`, `startDeviceLogPurge`), started from `server.js` |
| §5 admin API | `backend/src/routes/deviceLogsAdmin.js`, mounted at `/devices/logs` before `/devices` |
| §6 UI | `frontend/src/pages/clinics/ClinicLogsTab.jsx`, `frontend/src/api/deviceLogs.js`, `ClinicPage.jsx`, i18n en/cs/de |
| §7 logging | the route logs `{route, status, deviceId, code}` on a 500 only |

`device_logs` is applied to an existing database with `npm run db:uploads` (already applied to the test DB). `container_deployment.md` lists the three new `.env` keys. Backups are driven by `upload_sessions` rows, so `device-logs/` is never picked up; a test guards that no backup source mentions it.

## Tests

Backend (`cd backend && npm test`): `test/integration/deviceLogs.test.js` (every §2.3 row, resend, §3 path, text part after `file`, tmp removed after every test, 507, 429, 500, no secrets in log lines), `test/integration/deviceLogsPurge.test.js` (91 vs 89 days, cap oldest first, id tie-break, missing file), `test/integration/deviceLogsAdmin.test.js` (404 for non-master on all three routes, scoped list, gunzipped view, `.gz` download, ticket auth, audit rows, unknown id), `src/deviceLogs/purge.test.js` (boot + 24 h schedule, unref'd timer, backups), `src/storage/deviceLogKey.test.js`.

Frontend (`cd frontend && npm test`): `src/pages/clinics/ClinicLogsTab.test.jsx` (tab for master only, redirect for others, grouped by computer, View/Download, empty state, i18n keys).

## Deviations and notes

- **`audit_log.action` enum widened.** The spec asks for the actions `device_log_view` and `device_log_download`, but the column was an enum without them. `create_upload_tables.sql` now has an idempotent `ALTER TABLE audit_log MODIFY action enum(...)`. The log id goes in `details` (`{"logId": n}`); `upload_session_id` stays NULL.
- **Malformed `siteToken` is 404 `invalid_token`** (review fix): the app reads 400 as "never retry", so a mistyped token must not make it drop its files. Only `/device-logs`; `/upload` is unchanged. Other malformed parts, and a missing token, stay 400.
- **Server-side filesystem failures are 500** (review fix): a failure to create the tmp folder or file in the receiver used to fall back to 400 `bad_request`, which the app reads as never-retry. It now ends as 500 `internal` for both `/device-logs` and `/upload`; client-caused errors stay 400. Tests: `deviceLogs.test.js` ("a failure to create the tmp folder is 500…") and `src/upload/multipartReceiver.test.js`.
- **List without `siteId` is 400 `invalid_site`.** The spec says only that `siteId` is required.
- **Receipt time is whole seconds.** `device_logs.received_at` is a `datetime`, so `receivedAt` is cut to the second to make a resend return the same value.
- **View/download of a row whose file is missing is 404** (and writes no audit row).
- **Not tested:** a truly concurrent duplicate upload (the retry on `ER_DUP_ENTRY` is coded as in `/upload`). The integration helper runs on one rolled-back connection, which cannot interleave two transactions.
