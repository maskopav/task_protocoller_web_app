# MCP server: implementation plan

Read with [`01_spec.md`](01_spec.md) (**what** to build) and [`03_guidelines.md`](03_guidelines.md) (**how**). This file covers order, ownership and progress. Update the checklist in §4 whenever an increment lands.

## 1. Execution model

- Work happens on branch `mcp`, which is based on `newshare`. Each increment ends in a commit and a checkpoint with the user.
- **At most two agents run at the same time.** After each batch, the lead reports to the user and checks usage before starting the next one.
- Models:
  - **Opus** for auth, scoping, the allowlist shapers and the final review.
  - **Sonnet** for the frontend, i18n and docs.
- The definition of done for each increment:
  - `cd backend && npx vitest run` is green, including the integration suites against `tp-mariadb`.
  - For increment 5, `cd frontend && npm test && npm run build` is green.
  - The desktop contract golden test (`siteConfigGolden`) is unchanged.

## 2. Local environment

The environment is the same as [`../upload_management/implementation_plan.md`](../upload_management/implementation_plan.md) §2. The DB is the Docker container `tp-mariadb`; if Docker Desktop is down, ask the user to start it. Schema changes go in through `npm run db:test:reset`, which runs `runInit`.

The new dependencies are `@modelcontextprotocol/sdk` (1.x, pinned in the lockfile) and `zod`, both in `backend/`.

## 3. Increments and file ownership

| # | Increment | Files | Spec | Checkpoint |
|---|---|---|---|---|
| 1 | Docs | `docs/mcp/01–03` | all | The user reviews the spec and tool list |
| 2 | Tokens | `scripts/schema/create_tables.sql`, `drop_tables.sql`, `create_upload_tables.sql` (enum), `src/middleware/patAuth.js`, `src/middleware/requireHttps.js`, `src/controllers/mcpTokenController.js`, `src/routes/mcpTokens.js`, `src/middleware/rateLimiter.js` (additions), `src/controllers/userController.js` (`can_use_mcp`, master token routes), `src/routes/users.js`, `server.js` (mount) | §2, §3, §7 | Tests 1–3 and 7 pass |
| 3 | Read tools | `src/mcp/server.js`, `src/mcp/callHandler.js`, `src/mcp/shape.js`, `src/mcp/tools/read.js`, `src/mcp/router.js`, `server.js` (mount `/mcp`), `package.json` | §2, §4, §5 | Tests 4, 5 and 8 pass, plus a Claude Code demo locally |
| 4 | Write tools | `src/mcp/tools/write.js`, `src/mcp/protocolPreview.js`, `src/controllers/protocolController.js` and `libraryController.js` (split off `prepareProtocolSave` / `prepareLibraryCopy`) | §4, §6 | Test 6 passes |
| 5 | Frontend | `frontend/src/pages/account/AccountPage.jsx`, `frontend/src/api/mcpTokens.js`, `frontend/src/App.jsx`, the shell user menu, `frontend/src/pages/users/UserPage.jsx`, `frontend/src/i18n/{en,cs,de}/account.json`, `users.json`, `nav.json`, `frontend/src/i18n/index.js` | §3.3, §10 | Screenshots at about 1280px and about 800px; parity tests pass |
| 6 | Rollout | `docs/container_deployment.md`, `docs/mcp/05_results.md` | §9, §8.9 | Real-client runs recorded, then `/verify` |

## 4. Progress checklist

- [x] 1 Docs
- [x] 2 Tokens (2026-11-11: 16 new tests; 867/867 backend tests passing)
- [x] 3 Read tools (2026-11-11: 15 read tools; 874/874 backend tests passing, including scope parity and leakage tests with a raw-controller control; curl smoke test against a real server)
- [x] 4 Write tools (2026-11-11: 19 tools in total; 879/879 backend tests passing; site-config golden test unchanged)
- [x] 5 Frontend (2026-11-11: Account page, user-page switch and token list, en/cs/de; 381/381 frontend tests passing, build passes; screenshots in `screenshots/`)
- [ ] 6 Rollout and results
