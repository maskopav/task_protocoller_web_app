# Upload management (phase B): implementation guidelines

These rules apply to everyone who implements a task from
[`implementation_plan.md`](implementation_plan.md), human or agent. When a guideline and the
[`specification.md`](specification.md) disagree, the spec wins. Raise the disagreement in your
report.

## Before you start

1. Read the spec sections your task cites, the UI page(s) it implements, and UD
   (`NewShare/docs/dev/upload_data.md`) for anything touching the archive.
2. Read two or three neighbouring files in the same folder and copy their style. Good examples:
   `src/controllers/siteController.js` + `siteController.test.js`, and `src/utils/accessScope.js`.
3. Check the stub for your module. **Its exported names and JSDoc signatures are the contract.**
   Don't rename or re-shape them. If one is wrong, say so in the report.

## Scope discipline

- Touch only the files your task owns. If you need a change elsewhere, keep it minimal and
  additive, and list it in the report.
- Don't add features, endpoints, columns or config keys that aren't in the spec.
- New dependencies: only the ones listed for your task.

## Backend code style

- ESM, `async`/`await`, and the 2-space formatting of the surrounding code.
- DB access goes through `executeQuery` / `executeTransaction` from `src/db/queryHelper.js`.
  Every value is passed as a `?` parameter. An identifier that is interpolated (a sort column,
  for example) must come from a hard-coded whitelist map.
- Controllers stay thin. Rules live in pure functions (`src/upload/*`, `src/utils/*`) that can be
  tested without HTTP or DB.
- Comments explain **why** (constraints, past bugs, non-obvious choices), as the existing code
  does. Don't narrate what the code does.
- Errors go out as `res.status(code).json({ error: "<snake_case_code>" })`. Use the codes from
  the spec. On a 500, log with `logToFile("ERROR", msg, {error: err.message})` and never echo
  internals to the client.
- Large files are always streamed (`stream.pipeline`). Never `readFile` a ZIP, and never buffer
  a request or response body.
- Dates are written and returned as UTC ISO strings. The pool runs with `timezone: 'Z'` and
  `dateStrings: true`.

## Security and personal data (non-negotiable)

- **Never log** the upload filename, `patient_code`, participant field values, the site token,
  or DB credentials. Logs get `sessionId`, `installationId`, HTTP code and byte counts only.
- Every admin endpoint that takes a session or device id resolves it and then checks
  `canSeeSession` / `canEditSession`. A failed check returns **404**, never 403, so the response
  doesn't confirm that the record exists.
- Lists and aggregates are scoped in SQL with `scopeWhereClause`. Never fetch everything and
  filter in JS.
- Archive entry names are untrusted. Never join them into a filesystem path. Clip serving checks
  the name against `exam_summary`.
- Credentials never go into `argv` (that applies to `mariadb-dump` in particular).
- Public endpoints (`/upload`, `/device-checkin`) are rate-limited and validate every field
  format before touching the DB or disk.

## Schema changes

- Additive only. `create_tables.sql` is for fresh installs. Mirror every change in the
  idempotent `alter_uploads.sql` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), and
  add drops to `drop_tables.sql`.
- `runSqlFile.js` splits on `;`, so no semicolons inside comments or strings in SQL files.

## Testing

- Vitest. Mock `../db/queryHelper.js` the way `siteController.test.js` does, and dispatch on SQL
  substrings so tests don't depend on query order.
- Use the fixture builder (`test/fixtures/buildSessionZip.js`) for anything that reads ZIPs. Put
  new variants in the builder, not in ad-hoc ZIPs.
- File-system tests use a fresh `fs.mkdtemp` directory and clean it up.
- Every public behaviour in the spec that your task covers gets a test, including error paths
  and permission (404) paths.
- Before you report: `cd backend && npx vitest run` passes in full, not just your files. For
  frontend tasks, run `cd frontend && npx vitest run` too, plus the Playwright specs you
  touched.

## Frontend

- React 19, function components, `react-i18next` for every user-visible string (add keys for
  every language file that exists, with English text where you lack a translation), API calls
  through `src/api/apiClient.js`.
- Match the mockups in `docs/upload_management/ui_design/` in layout, labels, enum names and
  colours. Use the CSS conventions already in the app, and reuse components from
  `components/Shared`.
- Never render masked participant values that the API didn't send. Reveal is an explicit
  user action.

## Reporting (keep it short)

Report at most about 15 lines:
- what was done
- files touched outside your ownership, and why
- any spec gaps or disagreements
- the test command you ran and its result (pass count)
- anything you deliberately left out

Don't paste code into the report.
