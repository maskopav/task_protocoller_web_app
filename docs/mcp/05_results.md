# MCP server: results

**2026-11-11.** [`01_spec.md`](01_spec.md) is implemented and merged into `newshare` (`a1468bc`). It is deployed to share_web (commit `cada29b`). Criteria 1–9 are verified by tests. Criterion 10 (real clients) is partly verified. Criterion 11 (HTTPS through malenia) is still open; see "Open".

## Built

| Spec | Where |
|---|---|
| §2 `POST /mcp` (stateless, JSON) | `backend/src/mcp/router.js`, `backend/src/mcp/server.js`. Mounted in `server.js` only when `MCP_ENABLED=true`, before the app-wide body parsers |
| §2 HTTPS check | `backend/src/middleware/requireHttps.js` |
| §2 limiters | `createMcpAuthLimiter` (20 failed per 15 min per IP) and `createMcpCallLimiter` (300 per 15 min per token) in `middleware/rateLimiter.js` |
| §3.1 schema | `personal_access_tokens` and `users.can_use_mcp` in `create_tables.sql` (plus `drop_tables.sql` and the `v_users_management` view); audit actions in `create_upload_tables.sql` |
| §3.2 PAT auth | `backend/src/utils/pat.js`, `backend/src/middleware/patAuth.js` |
| §3.3 token API | `backend/src/controllers/mcpTokenController.js`, `routes/mcpTokens.js` (`/account/mcp-tokens`), master routes in `routes/users.js`, `can_use_mcp` in `userController.js` |
| §4 tools | `backend/src/mcp/tools/read.js` (15), `backend/src/mcp/tools/write.js` (4). Controllers are run through `backend/src/mcp/callHandler.js` |
| §5 allowlists | `backend/src/mcp/shape.js` |
| §6 preview and confirm | `backend/src/mcp/protocolPreview.js`; `prepareProtocolSave` (`protocolController.js`) and `prepareLibraryCopy` (`libraryController.js`) |
| §7 logging | one `mcp_call` line per call (tool, userId, tokenId, status, code) in `server.js` |
| §10 UI | `frontend/src/pages/account/*` (Account page, token table, setup snippets), `frontend/src/api/mcpTokens.js`, user page switch and token list, i18n en/cs/de |
| §9 deployment | `docs/container_deployment.md`, section "MCP server (AI assistants)" |

## Tests

Backend (`cd backend && npm test`): 879 tests, of which 28 are new (851 before).

- `test/integration/mcpTokens.test.js`: the token API, every 401 case of spec §8.1, the limiters, and no token in the logs.
- `test/integration/mcpRead.test.js`:
  - the MCP handshake and `tools/list`
  - scope parity (clinician, researcher, editor of another clinic's study)
  - out of scope looks the same as missing
  - the leakage scan with sentinels, plus a control that the raw controller output does carry them
  - logging
- `test/integration/mcpWrite.test.js`:
  - preview writes nothing
  - create, then new version, with `base_version`
  - `stale_version`
  - the same 403/404 as the UI
  - preview validation
  - library copy, comment and QC with audit
- Unit: `src/middleware/requireHttps.test.js`, `src/utils/pat.test.js`.

Frontend (`cd frontend && npm test`): 381 tests. New: `src/pages/account/AccountPage.test.jsx` and `mcpSetup.test.js`. The i18n parity check passes for en, cs and de.

UI check in Chromium against the test backend, with screenshots in `screenshots/`:
- the master's Account page
- the token dialog at 800 px
- the user page switch
- a clinician at 800 px, with no horizontal page scroll
- "not enabled"

## Deployment (share_web, 2026-11-11)

- The DB was recreated with `runInit.js`; it was empty beforehand.
- `MCP_ENABLED=true` was added to `.env`.
- The `location = /api/mcp` nginx block was added. The previous site file is in `/root/task-protocoller.nginx.bak-*`.
- Checks on `http://192.168.122.183:10001`:
  - the standard Verify set
  - a master token was created through the API
  - plain HTTP gets `403 https_required`
  - with `X-Forwarded-Proto: https`: `whoami` returns master, `tools/list` returns 19 tools, `list_recordings` works
  - `GET` gets 405; revoke gets 204, after which the token gets 401

## Deviations from the first spec draft

All of these are recorded in `01_spec.md`.

- **The token list returns `{allowed, tokens}`,** so the Account page knows whether to offer "New token".
- **Technical recording details** (`deviceId`, versions, checks) go only to users the master picked, as on the recording page. List rows never carry the installation id.
- **The protocol preview runs every pre-write check.** Instead of extracting only validation, the code before the write was split off as `prepareProtocolSave` and `prepareLibraryCopy`, so the preview can't pass what the save refuses. The preview also checks that task ids exist; the save checks that only through the foreign key, inside its transaction.
- **Passing a `protocol_group_id` always means "new version".** The web API's group-without-editing combination is not offered.
- **There are 19 tools, not 18.** `whoami` was missing from the first count.

## Open

1. **HTTPS through malenia (criterion 11).** `malenia.feld.cvut.cz` timed out from the deploy machine. Whoever can reach it should run "MCP server (AI assistants)" step 5 in `container_deployment.md`. `https_required` there means the outer proxy does not send `X-Forwarded-Proto: https`. 401 means it drops `Authorization`. Either fix it at malenia, or set `MCP_ALLOW_HTTP=true` and accept that the container cannot tell HTTP from HTTPS.
2. **Real clients (criterion 10).** curl and the Account page's own token were checked end to end. Claude Code, VS Code Copilot and one open-source CLI still need a run against the HTTPS address. They need item 1 first, or a local backend.
3. **Rate-limit key behind two proxies.** The failed-auth limiter is per IP and would be shared by everyone coming through malenia. The same applies to the existing login limiter. See `container_deployment.md`.
