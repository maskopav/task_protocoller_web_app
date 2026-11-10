# Spec: technical details on the Recording page only for chosen users

## Context
Note in `docs/notes/notes_for_agent_app_web.md` (Web, first bullet): the Recording (session) detail page holds a lot of
admin/developer information that confuses clinicians. The note suggests folding it. You chose differently: nothing
gets folded. A new per-user permission, switched in User management, decides who sees it.

```
Goal:        Clinicians see a calm Recording page. The master and the users the master picks still get the diagnostics.
Deliverable: New per-user flag "May see technical details" (users.can_see_technical), a switch on the User page, and
             the Recording page hiding three blocks for users without it.
```

## What counts as "technical"
(You confirmed this list.)
1. The **Server checks** card (right column, `ServerChecks`).
2. The **IDs row** of the Session card: Session ID, Config version (+ "old" badge), ZIP SHA-256 (`ids` in `SessionPanel`, and the `<hr>` above it).
3. The **Upload history** card (`UploadHistory`). Its `fetchAttempts` call is skipped too.

Everything else stays as it is for everyone: the Session facts grid, the status/QC pills and the invalid reason, flags, tasks, the timeline and Activity.

## Acceptance criteria
1. A master always sees all three blocks. There is no switch for masters, matching how the Permissions section is hidden for them today.
2. A non-master with the flag off, which is the default for new users and for all seeded users, sees none of the three. The page has no empty gap: the Session card ends after the facts grid, and the aside shows only Review and Participant.
3. A non-master with the flag on sees all three, exactly as today.
4. The User page's Permissions section has a third switch, "May see technical details", with a one-line hint: "Server checks, IDs and upload history on recordings". Toggling it saves at once, like the other two switches (`PATCH /users/:id { can_see_technical }`).
5. **A change takes effect on the user's next page load, with no re-login.** The server works out `showTechnical` on every `GET /uploads/:id` from the DB. It is not taken from the cached localStorage user.
6. The Users list summary (the "can create" text in `UsersListPage.jsx:116`) also mentions "technical details" when the flag is on.
7. Strings are translated in en, cs and de (`users.json` and, if any are needed, `recording.json`).
8. Existing tests stay green. Nothing in the desktop contract changes (upload, check-in, config). The flag lives only in the admin API.

## Key decisions
- **The server decides and the client hides.** `getSession` adds `showTechnical: isMaster || users.can_see_technical`. The fields themselves (id, zipSha256, checks, …) are still sent. They are not secrets: the session id is already in the URL, and pills and flags derive from them. Rejected option: stripping the fields server-side. It adds a second code path for no security gain.
- **The flag is read fresh per request** through the existing `hasUserFlag` (`backend/src/utils/accessScope.js:73`). A new export `canSeeTechnical` is added next to `canCreateSites`/`canCreateProjects`. Rejected option: putting it in the login payload, which lags until re-login (the same caveat noted in `authController.js`).
- `getAttempts` stays callable, so nothing breaks. The frontend just doesn't call it when `showTechnical` is false.
- **Schema:** add the column directly to `create_tables.sql` and `v_users_management` in `create_views.sql`. There is no alter script (per the no-db-migration rule). The local DB is recreated via `runInit.js`.
- Design follows the frontend-design guidance applied to this existing system. There are no new visual elements, only one more `Switch` in the existing Permissions card. The wording is plain and user-facing ("technical details", not "debug info"). The hint names exactly what appears, so the master knows what they're granting.

## Files
- `backend/scripts/schema/create_tables.sql`: `can_see_technical BOOLEAN NOT NULL DEFAULT 0 COMMENT 'Master-granted: sees server checks, IDs, upload history'`
- `backend/scripts/schema/create_views.sql`: add the column to `v_users_management`
- `backend/src/utils/accessScope.js`: `export const canSeeTechnical = (id) => hasUserFlag(id, "can_see_technical")`
- `backend/src/controllers/userController.js`: `userRow`, `USER_SQL`, the `createUser` insert (optional field), and the `updateUser` key list. Update `userController.test.js` to match.
- `backend/src/controllers/uploadController.js` (`getSession`, ~l.540): compute `showTechnical` using the existing master check in that controller, and add it to the JSON. Add a test in `uploadController.test.js` covering master = true, non-master flag off/on.
- `frontend/src/pages/RecordingPage.jsx`: `const tech = !!s.showTechnical`. Render `ServerChecks`/`UploadHistory` only when `tech`. Skip `fetchAttempts` when it is false. Pass `showIds={tech}` to `SessionPanel`.
- `frontend/src/components/Recording/SessionPanel.jsx`: render the divider and IDs only when `showIds`.
- `frontend/src/pages/users/UserPage.jsx`: third `Switch` (`data-testid="user-flag-technical"`) and a hint line.
- `frontend/src/pages/users/UsersListPage.jsx`: add the summary part.
- `frontend/src/api/users.js`: comment and type note.
- `frontend/src/i18n/{en,cs,de}/users.json`: `permissions.technical`, `permissions.technicalHint`, `canCreate.technical`
- Tests: `Recording.test.jsx` (hidden vs shown), `userLogic`/UserPage test where one exists, and the e2e `users-ui.spec.ts` toggle.
- Spec saved to `docs/technical_details/spec.md` (per the docs-before-code rule).

## Increments
Small enough to do inline, without subagents.
1. Save the spec to docs. Make the schema, accessScope, userController and getSession changes, with backend tests. Checkpoint: backend vitest green, with `runInit.js` run against local `tp-mariadb` (ask you to start Docker Desktop if it's down).
2. Frontend Recording page and SessionPanel gating, with tests. Checkpoint: vitest green.
3. User page switch, list summary, i18n. Checkpoint: run the app and take screenshots of (a) a clinician's Recording page without the blocks, (b) the same with the flag on, and (c) the User page Permissions card.
4. E2E toggle test, then `/verify` against criteria 1–8. Checkpoint: Playwright green, results reported.

## Verification
- Backend: `npm test` in `backend/`, with the new getSession test cases and the user PATCH validation of `can_see_technical`.
- Frontend: `npm test` (vitest) in `frontend/`. `Recording.test.jsx` asserts that "Server checks", Session ID and Upload history are absent and present, and that `fetchAttempts` is not called when the flag is off.
- E2E (Playwright, local DB): the master toggles the flag for a clinician. Logged in as the clinician, reload the Recording page and the blocks appear with no re-login. Toggle off and they disappear.
- Manual screenshots at ≥800px width (no phone support), then `/verify`.

## Assumptions (veto any)
- The Recordings list "Server check" column stays as it is for everyone (out of scope).
- The flag only affects the Recording detail page, not Clinic → Logs (still master-only) or anything else.
- Hidden failed checks are still visible to clinicians through the status pill ("Invalid" + reason) and flags. No extra notice is needed.

## Out of scope
Folding UI. Hiding Session-grid facts (app version, installation id). Changing Logs access. Desktop app changes.
