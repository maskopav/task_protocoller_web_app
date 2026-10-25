# Golden files for GET /site-config/:token

Frozen output of the desktop-facing endpoint for every seeded site
(1 Paris, 2 London, 3 E2E Site, 4 E2E Clinic A, 5 E2E Clinic B), compared by
`test/integration/siteConfigGolden.test.js`. The test fails if the config JSON,
the HTTP status or the content-type changes. It guards schema, view, seed and
i18next changes against silently breaking the desktop app.

Each file holds `{ status, contentType, body }`. Only `configVersion` is
normalised (it is derived from `updated_at`, which the seeds set to the current
time); every other field is compared verbatim, key order ignored.

Run: `npm run db:test:reset` then `npx vitest run test/integration/siteConfigGolden.test.js`
(skipped when the test DB is unreachable).

Regenerate: `UPDATE_GOLDEN=1 npx vitest run test/integration/siteConfigGolden.test.js`

**Regenerating requires the user's explicit approval, because the desktop
contract is frozen.** A failing diff is a bug to fix in the code, not a fixture
to refresh. Seed ids and tokens must stay stable: the test requests the fixed
tokens from `artificial_data.sql` and `e2e_seed.sql`.
