# MCP server: implementation guidelines

These rules apply to everyone who implements an increment from [`02_implementation_plan.md`](02_implementation_plan.md), human or agent. When a guideline and [`01_spec.md`](01_spec.md) disagree, the spec wins. Raise the disagreement in your report.

## Before you start

1. Read the spec sections your increment cites, plus `backend/src/utils/accessScope.js`, `backend/src/upload/sessionAccess.js` and `backend/src/middleware/authMiddleware.js`.
2. Copy the style of the neighbouring files: `src/controllers/uploadController.js` with its test, and `src/middleware/rateLimiter.js`.
3. The general backend rules of [`../upload_management/guidelines.md`](../upload_management/guidelines.md) apply: ESM, `executeQuery` / `executeTransaction`, `?` parameters only, thin controllers.

## The four rules that matter most

1. **Never re-implement a permission rule.** A tool reaches data only through an existing controller, called with `callHandler`, or through an existing scope helper: `findScopedSession`, `scopeWhereClause`, `getVisibleProjectIds` or `canEditProject`. If a tool needs data no controller returns, stop and raise it. The only exception is `list_task_catalog`, which reads non-sensitive reference tables.
2. **Allowlist every response.** A shaper names each key it copies. Never spread (`...row`) a controller result into a tool result. A new key needs a spec change in §5 first.
3. **Participant data never leaves.** The only allowed values are `patient_code` and `visit_number`. File names, paths, check details, questionnaire answers and participant-edit traces count as participant data.
4. **Never log arguments or results.** Log the tool, user id, token id, status and error code only. That includes errors: log `err.code ?? err.name`, never `err.message`, because DB messages can quote values.

## Adapter (`callHandler`)

- Signature: `callHandler(handler, { admin, params = {}, query = {}, body = {} })` resolves to `{ status, body }`.
- The fake `res` supports `status()`, `json()`, `send()`, `set()` and `setHeader()`, and settles once. A handler that streams or sends a file is a programming error, so throw.
- A thrown or rejected handler resolves to `{ status: 500, body: { error: "internal" } }` after logging per rule 4.
- `admin` is always `req.admin` from `patAuth`. Never build it from tool input.

## Tools

- Each tool has a zod input schema with bounded strings (for example `text` up to the existing `COMMENT_MAX`) and integer ids.
- Descriptions are short, factual and model-agnostic. Write tools say what they change. `save_protocol` says that saving goes live to the clinics' computers and that it must be previewed first. `add_recording_comment` says that comments must not contain names or identifiers.
- A controller's 4xx becomes `isError: true` with `{error, status}`. Keep the web API's error codes.

## Tests

- Unit tests sit next to the files and mock `queryHelper.js`, in the existing `mockDb` style.
- Integration tests go in `backend/test/integration/mcp*.test.js`. They use `testDb.js` with `withRollback`, and `supertest` against an app with `/mcp` mounted. Tests insert their own users, sites and projects with a random tag.
- The leakage test is the regression guard for rule 3. Extend its sentinel list whenever a new field is shown anywhere in the recording UI.

## Scope discipline

- Touch only the files your increment owns (plan §3). Keep any other change minimal and additive, and list it in the report.
- Do not change `/site-config`, `/device-checkin`, `/upload`, `extConfig.js` or the ZIP format.
- Do not write alter or migration scripts. Schema changes go into the init SQL, apart from the existing idempotent `audit_log` enum `ALTER` line.
