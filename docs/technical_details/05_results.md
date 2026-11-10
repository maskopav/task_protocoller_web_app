# Results: technical details only for chosen users (2026-11-10)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Master always sees all three blocks | PASS | `uploadController.test.js` "showTechnical" case (master → true, no flag query) |
| 2 | Flag off (default) hides them, no gap | PASS | `Recording.test.jsx` hidden case (no divider, no `fetchAttempts`); e2e `users-ui.spec.ts:61`; screenshot of a clinician with the flag off |
| 3 | Flag on shows them | PASS | `Recording.test.jsx` shown case; e2e after the switch; screenshot of the flag on |
| 4 | Third switch + hint, saves at once | PASS | e2e clicks `user-flag-technical`; `userController.test.js` PATCH + `invalid_can_see_technical` |
| 5 | Applies on reload without re-login | PASS | e2e: the clinician stays logged in and reloads, and the blocks appear |
| 6 | Users list mentions it | PASS | e2e asserts "Technical details" in the row |
| 7 | en/cs/de strings | PASS | `users.json` ×3 |
| 8 | Existing tests green, contract untouched | PASS | backend vitest 851/851, frontend vitest 369/369, Playwright 186/186; critic found no contract change |

Spec change made during implementation: the Users list column "Can create" is renamed to "Permissions". Its entries now read "Create studies" / "Create clinics" / "Technical details", so the new entry doesn't sit under a "Can create" header.

Deploy note: deploy the backend together with or before the frontend. A new frontend on an old backend gets `showTechnical` undefined and hides the blocks even for masters. The DB must be recreated via `runInit.js` (new `users.can_see_technical` column).
