# MCP server: specification

**Version 1.0, 2026-11-11. Status: approved, not yet implemented.**

The backend exposes a remote **Model Context Protocol (MCP)** endpoint. Users connect their own AI clients to it: Claude Code, VS Code Copilot, Cursor, Codex or Gemini CLI, opencode, Goose, or local-model clients. Each connection acts as **one web user**, with exactly that user's visibility and edit rights. **No participant data** leaves through MCP, whatever model sits behind the client.

| Related document | Use |
|---|---|
| [`02_implementation_plan.md`](02_implementation_plan.md) | Order, increments, progress checklist |
| [`03_guidelines.md`](03_guidelines.md) | How to implement: allowlists, logging, tests |
| [`../ui_redesign/02_spec.md`](../ui_redesign/02_spec.md) §4 | Access model: clinics you see, studies you edit |
| `backend/src/utils/accessScope.js`, `backend/src/upload/sessionAccess.js` | The scope rules MCP reuses |
| [`../container_deployment.md`](../container_deployment.md) | nginx and TLS setup MCP must fit into |

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Remote Streamable HTTP**, mounted in the existing Express app. There is no separate process. |
| D2 | **Stateless**: no MCP sessions, no SSE, JSON responses only (`enableJsonResponse`). Only MCP *tools* are offered, with no resources or prompts. This is the common subset that every client supports. |
| D3 | **One user per token.** Auth is a **personal access token (PAT)** sent as `Authorization: Bearer tpm_…`. OAuth 2.1 is planned for v2. The auth layer resolves "credential → `req.admin`", so OAuth can be added as a second credential source. |
| D4 | **Rights parity.** Tools call the existing controllers, so every rule in them applies unchanged. Out of scope and missing look the same ("not found"). |
| D5 | **v1 = reads + safe writes.** The writes are a comment on a recording, setting a recording's QC, saving a protocol in a study you edit, and copying a library protocol into such a study. |
| D6 | **Participant data is never exposed.** The only participant values allowed are `patient_code` and `visit_number`. Reveal, participant edit, downloads and CSV export are not offered. |
| D7 | **Allowlist responses.** Every tool result is built by an explicit allowlist shaper (§5). A blocklist would leak any column added later. |
| D8 | **Human comments are readable and writable.** System comments about participant edits are dropped. Tool descriptions say that comments must not contain identifiers. |
| D9 | **Protocol writes use preview, then confirm.** Without `confirm: true` nothing is written. Saving goes live to every computer at the clinics that run the study. |
| D10 | **Opt-in per user.** A master sets `users.can_use_mcp`. Masters are always allowed. |
| D11 | **Opt-in per deployment.** `/mcp` is mounted only when `MCP_ENABLED=true`. |
| D12 | **HTTPS only.** A PAT is refused on plain HTTP, except from loopback or with `MCP_ALLOW_HTTP=true` (the internal test container). |
| D13 | **The desktop contract is untouched.** `/site-config`, `/device-checkin`, `/upload`, the config JSON and the ZIP format stay as they are. |

## 2. Endpoint

```
POST /mcp          (behind nginx: /api/mcp, public URL https://<host>/koubic/api/mcp)
Authorization: Bearer tpm_<43 chars base64url>
Content-Type: application/json
Accept: application/json, text/event-stream
```

- The endpoint handles JSON-RPC 2.0 as MCP Streamable HTTP. Each request builds a fresh `McpServer` and a `StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`.
- `GET /mcp` and `DELETE /mcp` return **405** with `Allow: POST`.
- It is mounted after the JSON body parser, with its own 1 MB limit.
- Requests that send an `Origin` header go through the existing CORS allowlist, which guards against DNS rebinding. Native clients send no `Origin` and pass.
- Order of checks: `MCP_ENABLED` (route absent, so 404), then the HTTPS check (D12, 403 `https_required`), then the failed-auth rate limiter, then PAT auth (401), then the per-token rate limiter (429), then the MCP transport.

### 2.1 Errors

| Situation | Response |
|---|---|
| Missing, malformed, unknown, revoked or expired token; inactive user; `can_use_mcp` off (non-master); `token_version` changed | 401 `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer` |
| Plain HTTP (D12) | 403 `{"error":"https_required"}` |
| Too many failed auth attempts from one IP (20 per 15 minutes) | 429 |
| Too many calls on one token (300 per 15 minutes) | 429 |
| A tool's controller returns 4xx | An MCP tool result with `isError: true`, whose content is `{"error":"<code>", "status": <n>}`, using the same error codes as the web API |
| The controller throws or returns 5xx | Tool result `isError: true`, `{"error":"internal"}`. The details are logged per §7 and never sent to the client. |

## 3. Personal access tokens

### 3.1 Schema

The schema lives in `create_tables.sql` and is recreated via `runInit`. There are no alter scripts.

```sql
-- users: new column
can_use_mcp tinyint(1) NOT NULL DEFAULT 0

CREATE TABLE personal_access_tokens (
  id            int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       int NOT NULL,
  name          varchar(64) NOT NULL,
  token_prefix  char(12) NOT NULL,          -- "tpm_" + first 8 chars, shown in lists
  token_hash    char(64) NOT NULL UNIQUE,   -- sha256 hex of the full token
  token_version int NOT NULL,               -- users.token_version at creation
  created_at    datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  datetime NULL,
  expires_at    datetime NOT NULL,
  revoked_at    datetime NULL,
  KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

The `audit_log.action` enum gains `mcp_token_create` and `mcp_token_revoke`, in both the `CREATE` and the existing idempotent `ALTER`.

### 3.2 Token format and validation

- Token: `tpm_` + base64url(32 random bytes). The client sees it **once**, at creation. Only the sha256 is stored.
- A token is valid when all of these hold:
  - its hash is found, `revoked_at` is NULL, and `expires_at` is later than now
  - the user is active
  - the user is a master, or `can_use_mcp = 1`
  - `token.token_version` equals `users.token_version`
- A password reset or setup-profile bumps `token_version` and therefore retires every token. Deactivating a user or turning off `can_use_mcp` takes effect on the next call.
- `req.admin` gets the same shape as `loadAdmin` in `authMiddleware.js`: `{ id, email, role, role_id, tv }`, plus `via: "mcp"` and `tokenId`. The role comes from the DB on every call.
- `last_used_at` is updated at most once a minute per token, as a fire-and-forget write.

### 3.3 Token API (JWT session only, never with a PAT)

| Route | Who | Behaviour |
|---|---|---|
| `GET /account/mcp-tokens` | any logged-in user | `{ allowed, tokens }`. `allowed` says whether you may create tokens. Each token row is `id, name, prefix, createdAt, lastUsedAt, expiresAt, revokedAt, active`, with no hash and no token. |
| `POST /account/mcp-tokens` `{name, expiresInDays}` | master, or `can_use_mcp` | `expiresInDays` is 30, 90 or 365 (default 90). Name 1–64 chars. At most 10 active tokens, else 409 `token_limit`. Returns 201 `{…row, token}` once. Audit: `mcp_token_create`. Without the right: 403 `mcp_not_allowed`. |
| `DELETE /account/mcp-tokens/:id` | the owner | Sets `revoked_at` and returns 204. Revoking an already revoked token also returns 204. 404 if the token is not found or not yours. Audit: `mcp_token_revoke`, written once. |
| `GET /users/:id/mcp-tokens` | master | `{ tokens }`, with the same row shape. |
| `DELETE /users/:id/mcp-tokens/:tokenId` | master | Revoke. Audit: `mcp_token_revoke`. |
| `PATCH /users/:id` `{can_use_mcp}` | master | The existing route, with one more flag beside `can_create_*`. |

## 4. Tools (v1)

Tool names are snake_case. Every input schema is zod. IDs are the web API's own ids. Recordings use the 32-hex `session_id`.

| Tool | Input | Calls | Returns (after the §5 allowlist) |
|---|---|---|---|
| `whoami` | — | `req.admin` + `users` | `{ id, name, role, clinics:[{id,name}], canCreateStudies, editableStudyIds }` |
| `list_studies` | `{ include_archived? }` | `getProjectList` | studies with `owned`/`received`, counts |
| `get_study` | `{ study_id }` | `getProject` | the study, its clinics, its counts |
| `list_clinics` | — | `getSites` | clinics you see |
| `get_clinic` | `{ clinic_id }` | `getSiteById` | the clinic, **never** `access_token` |
| `list_protocols` | `{ study_id, include_archived? }` | `getProtocolsByProjectId` | protocol summaries |
| `get_protocol` | `{ protocol_id }` | `getProtocolById` | the full protocol design (tasks, params, texts, identifier field *names*, file-name template) |
| `list_library` | — | `listLibrary` | library entries |
| `get_library_entry` | `{ entry_id }` | `getLibraryEntry` | the entry |
| `list_task_catalog` | — | direct SELECT, explicit columns | `tasks`, `task_types` and `languages` (ids, names, types). Needed to build protocols. |
| `list_recordings` | filters of `parseListQuery`: `q, site, project, protocol, dateField, from, to, status, qc, flag, hasVideo, attention, sort, dir, page, pageSize` | `listUploads` | rows per `listRow`, with only `patient_code` and `visit_number` |
| `get_recording` | `{ session_id }` | `getUpload` | allowlisted (§5) |
| `get_recording_summary` | `{ site_id?, project_id?, days? }` | `getSummary` | counts |
| `list_recording_comments` | `{ session_id }` | `getComments` | human comments only (§5) |
| `list_computers` | `{ clinic_id? }` | `listDevices` | computers, health, counts |
| `add_recording_comment` | `{ session_id, text }` | `addComment` | the comment. Description: *must not contain names or other identifiers*. |
| `set_recording_qc` | `{ session_id, qc: unreviewed\|ok\|review\|excluded }` | `putQc` | `{ qc }`. The existing `qc_change` audit and system comment apply. |
| `save_protocol` | the `saveProtocol` body + `confirm?`, `base_version?` | preview (§6) / `saveProtocol` | preview, or the saved protocol |
| `copy_library_protocol` | `{ entry_id, study_id, name, confirm? }` | preview (§6) / `copyFromLibrary` | preview, or the new protocol |

`mappings`, `exportCsv`, downloads, reveal, participant edit, device logs, users, editors and runs-at are **not** offered.

## 5. Allowlists (normative)

Each tool has a shaper in `backend/src/mcp/shape.js`. **Only the keys listed here leave.** A key not listed is dropped.

- **Recording list row:** the keys of `listRow` (`uploadController.js`), named explicitly:
  - `id, siteId, site, deviceLabel, protocol, projectId, project`. The computer's installation id (`deviceId`) is not included.
  - `startedAt, endedAt, processedAt, receivedAt, durationS, bytes`
  - `status, invalidReason, qc, issues, needsAttention`
  - `tasksTotal, tasksDone, tasksSkipped, hasAudio, audioClips, videoClips`
  - `participant {patient_code, visit_number}, canEdit, commentCount`
- **Recording detail:** the list-row keys, plus:
  - `recovered, interruptions, timelineUsed, captureFormat, sampleRate`
  - `tasks[]` as `{taskIndex, type, subtype, repetition, result, takes, videoComplete, videoDurationMs, audioDurationMs, hasClip, hasVideo, hasAnswers}`. Dropped: `clipFile`, `videoFile`, `questionnaireAnswers`, any file name or path.
  - `comments` as in `list_recording_comments`
  - **Technical details, only when `showTechnical` is true:** `deviceId, appVersion, configVersion` and `checks[]`. `showTechnical` is true for a master, or a user the master picked (`can_see_technical`), the same rule as the recording page. `checks[]` is `{key, result}` only. `detail` is dropped, because it quotes zip entry names.
- **Dropped from the recording detail:**
  - `participant.fields`, `participant.maskedKeys`, `participant.editedAt`
  - `questionTexts`, `videoTakes`, `hardware`, `timeline`, `interruptionEvents`, `zipSha256`
- **Comment:** `{id, author, at, text, kind}`, where `author` is the staff display name and `kind` is `comment` or `qc`. A system note is kept only if it is a QC change (`set review to …`). Every other system note is dropped, because a participant-edit note names the edited fields.
- **Clinic:** no `access_token`, ever. Contact fields are staff data and allowed.
- **Protocol / library entry:** protocol design only. `required_identifiers` are field **names**, and `recordings_file_name` is the template. Both are allowed.

A **leakage test** (§8) seeds sentinel strings into every dropped field, then deep-scans the serialized result of every tool.

## 6. Protocol writes: preview, then confirm

- `prepareProtocolSave(req, res)` is split off `saveProtocol` (and `prepareLibraryCopy` off `copyFromLibrary`). It holds **every** check that runs before the write, unchanged: validation, rights, name uniqueness and group integrity. It answers the error itself, or returns `{ ok: true, … }`. The save calls it first, and so does the preview, so a preview can never pass something the save would refuse.
- MCP input: passing `protocol_group_id` always means "save a new version" (`editingMode`), and leaving it out means "create". The web API's group-without-editing combination is not offered.
- **Preview (no `confirm`)**, all read-only:
  1. Rights check: `canEditProject` (masters pass), the study exists and is active, and, for edits, the group belongs to the study. The 403/404 codes are the same as the UI's.
  2. The rest of `prepareProtocolSave`, plus a check that every `task_id` is a known task kind. The save would otherwise fail on that only inside its transaction.
  3. For edits, a diff against `assembleProtocol(currentId)`: changed top-level fields, tasks added, removed or reordered, and params changed.
  4. Affected clinics: `{ total, visible }`. `total` counts every clinic running the study. `visible` names only the clinics you can see, so the preview never names a clinic outside your access. A library entry has none.

  It returns `{ preview: true, valid, errors?, diff, affectedClinics, baseVersion }`, and the tool text says that saving goes live to these clinics' computers.
- **Confirm (`confirm: true`)**: for edits, `base_version` is required (else 400 `base_version_required`). It must equal the group's current version, else 409 `stale_version` with `currentVersion`. Then `saveProtocol` runs through the adapter.
- Both protocol tools carry `destructiveHint: true`, so clients that honour it ask the user before running them.
- A tool error carries the web API's code and status, plus only these detail keys: `index`, `question`, `detail`, `max`, `currentVersion`.
- `copy_library_protocol` works the same way: the preview shows the entry, the target study and the affected clinics, and confirm calls `copyFromLibrary`.

## 7. Logging and audit

- One log line per call: `logToFile("INFO", "mcp_call", { tool, userId, tokenId, status, code? })`.
- **Never logged:** tool arguments, results, the token or its hash, comment text, `patient_code`.
- On a 5xx, log `{ tool, userId, code: err.code ?? err.name }` only.
- Audit (DB-only): `mcp_token_create` and `mcp_token_revoke`. The existing `qc_change` audit applies unchanged when QC is set through MCP.

## 8. Required tests

1. **PAT auth:** valid; missing; malformed; unknown; revoked; expired; inactive user; `can_use_mcp` off; master without the flag (allowed); `token_version` bumped; a JWT sent to `/mcp` (401); a PAT sent to `/account/mcp-tokens` (401).
2. **HTTPS check:** `X-Forwarded-Proto: http` from a non-loopback address gives 403. Loopback, `https` and `MCP_ALLOW_HTTP=true` pass.
3. **Token API:** shown once; only the hash is stored; limit of 10; master list and revoke; revoking an unknown or foreign token gives 404; audit rows are written.
4. **Scope parity** (integration, real DB):
   - A clinician sees only their own clinic.
   - A researcher sees N clinics.
   - An editor of a study at another clinic does not see its recordings.
   - An out-of-scope `session_id`, `study_id` or `clinic_id` returns not-found, identical to a missing id.
5. **Leakage:** sentinels in `participant_fields`, clip and video file names, questionnaire answers, check `detail`, participant-edit audit and system comments, and `access_token`. A deep scan of every tool's result finds none.
6. **Writes:**
   - A comment or QC change produces the same rows as the UI.
   - A preview writes nothing (row counts are unchanged).
   - A stale `base_version` is refused.
   - A non-editor gets 403 `not_editor`.
7. **Logs:** a call with a sentinel argument leaves no sentinel in `system_log.txt`.
8. **Regression:** the `siteConfigGolden` test and the existing suites stay green.
9. **Real clients**, recorded in `05_results.md`: Claude Code, VS Code Copilot and one open-source CLI complete `whoami`, `list_recordings` and `get_recording` locally. Claude Code also does so over the real HTTPS URL.

## 9. Deployment

- `MCP_ENABLED=true` and, for the internal HTTP test container only, `MCP_ALLOW_HTTP=true`.
- nginx gets a new block:

  ```nginx
  location = /api/mcp {
    proxy_pass http://127.0.0.1:3000/mcp;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_buffering off;
    proxy_read_timeout 120s;
    client_max_body_size 1m;
  }
  ```

  It sets `X-Forwarded-Proto`, which the outer TLS proxy passes on.
- The outer proxy for malenia is not in this repo. It must forward `Authorization` and allow calls of about 60 seconds. Behind two proxies, check that `req.ip` is the real client. If it isn't, set `TRUST_PROXY_HOPS` and document it.
- Clients need a publicly trusted certificate. With a self-signed one, users of Node-based clients must set `NODE_EXTRA_CA_CERTS`.
- **v2 OAuth note:** discovery uses `/.well-known/oauth-protected-resource/koubic/api/mcp` at the host root, so the outer proxy needs a rule for it.

## 10. Client setup (shown on the Account page)

```bash
# Claude Code
claude mcp add --transport http task-protocoller https://<host>/koubic/api/mcp \
  --header "Authorization: Bearer tpm_…"
```

```jsonc
// VS Code (GitHub Copilot agent mode) — .vscode/mcp.json
{
  "inputs": [{ "id": "tp-token", "type": "promptString", "password": true, "description": "Task Protocoller MCP token" }],
  "servers": {
    "task-protocoller": {
      "type": "http",
      "url": "https://<host>/koubic/api/mcp",
      "headers": { "Authorization": "Bearer ${input:tp-token}" }
    }
  }
}
```

```bash
# Any stdio-only client
npx mcp-remote https://<host>/koubic/api/mcp --header "Authorization: Bearer tpm_…"
```

## 11. Out of scope (v1)

- OAuth 2.1 (v2)
- MCP resources and prompts, SSE and sessions
- Downloads, reveal, participant edit, CSV export, device logs
- User, editor, clinic and runs-at administration
- Any desktop contract change
