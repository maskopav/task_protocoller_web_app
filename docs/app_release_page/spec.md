# Spec: example-audio links behind malenia + "App release" admin page

## Context
- Clinics configured with `serverBaseUrl=https://malenia.feld.cvut.cz/koubic` get no example-audio button.
  The backend sends `audioExamplePath` as an absolute URL built from `ASSET_BASE_URL`, which is the
  internal address `http://192.168.122.183:10001`. Clinics can't reach that address.
  See `NewShare/docs/HANDOFF-2026-11-13-example-audio-links.md`.
- Admins also have no way to see which desktop release the server serves, or to hand a clinic a
  download link for the install bundle.

**Goal:** malenia clinics get working example audio, and authorised staff can see the served
version and copy a clinic-reachable install link.

**Repos:**
- Desktop: `C:\Users\koubato2\IdeaProjects\NewShare`, branch `old_ui`.
- Web: `C:\Users\koubato2\IdeaProjects\task_protocoller_web_app`, branch `newshare`.

## How the updater works (for reference)
- **What the app calls.**
  - The app calls `GET <base>/api/version/latest?platform=windows-x86_64`, which returns
    `{release, components:[{id,target,url:"download/<v>/<artifact>",checksum}]}`.
  - `HttpVersionFetcher.resolveComponentUrls` resolves each relative `url` against the endpoint.
    It downloads only components whose checksum changed.
- **Where releases live.**
  - Releases are folders under `/srv/task-protocoller/releases/<x.y.z>/` on share_web, read by
    `backend/src/releases/releaseStore.js` (`latestRelease`, `allowedArtifacts`, `componentsFor`).
  - They are served by `backend/src/routes/version.js` (public, with Range support).
  - Each folder also holds a full first-install bundle `install-*.zip`. It can be downloaded, but it
    is not an update component.
- **Publishing.**
  - Run `./gradlew -PappVersion=x.y.z -PserverBaseUrl=… :packaging:publishWindowsRelease`.
  - This runs `tools/release/release.sh`, which uploads with scp to `.incoming-<v>`, verifies the
    sha256 sums, `mv`s the folder to `<v>` (that is the moment it goes live), then runs a live check.

## Decisions (from your answers + defaults)
1. **Audio fix: the handoff's recommended fix.**
   - The backend sends the relative `audio/illustrations/<key>.wav` to apps ≥ **1.0.2**.
   - Older or unknown clients keep getting the absolute `ASSET_BASE_URL` URL.
   - The app resolves relative paths against `SERVER_BASE_URL`.
2. **Where the app resolves: inside `KtorExampleAudioCache`.**
   - A single `resolveExampleUrl(raw, base)` is used by `sync`, `localFileFor` and `prune`, so the
     cache key is always the resolved URL and stays deterministic.
   - A leading `/` counts as relative to the server base, so `/koubic` is kept.
   - A `..` that escapes the server base is rejected.
   - Anything that doesn't resolve to http(s) is rejected.
   - Absolute http(s) URLs pass through unchanged.
3. **Clinic link origin: a new backend env `PUBLIC_BASE_URL=https://malenia.feld.cvut.cz/koubic`.**
   - The page builds the clinic link from it.
   - If it is unset, the page falls back to the browser's origin and shows a warning.
4. **Stable link: a new route `GET|HEAD /api/version/download/latest/<install-name>`.**
   - It sends a 302 with a **relative** `Location: ../<v>/<install-name>`, so it works through
     malenia's prefix-stripping proxy.
   - It returns 404 if nothing is published or the name isn't an `install-*` file of the latest release.
   - The page shows the stable link (primary, with a copy button) and the versioned link.
5. **The page.**
   - Menu item "App release" under the Admin heading in `AppShell.jsx`.
   - Visible to masters and to users with `can_see_technical`.
   - The Admin heading shows for anyone who has at least one admin item.
   - Content, kept minimal:
     - the served version;
     - the publish date (from the release folder's mtime);
     - each install bundle in the release: file name, size, SHA-256, stable link with a copy
       button, versioned link.
   - Shows a "No release published" empty state when there is none.
6. **Authorisation.**
   - New `GET /app-release` (requireAuth). It allows a master or `canSeeTechnical(userId)`, read
     fresh from the DB on each request (`backend/src/utils/accessScope.js:86`), and answers 403
     otherwise.
   - The menu needs the flag on the client, so `can_see_technical` is added to the login/user payload
     (`authController.js:37`) and stored in `UserContext`.
   - A change to the flag shows in the menu only after re-login. This is the same caveat as the
     existing `can_create_*` flags. The server check is always fresh.
8. **Invite email.**
   - `sendAdminWelcomeEmail` (`backend/src/utils/emailService.js:102`, called from
     `userController.js:142`) gets an optional `appDownloadLink`.
   - When set, the email shows one more row, "Desktop app (Windows)", with the stable latest link
     `${PUBLIC_BASE_URL}/api/version/download/latest/<windows install-*.zip>`.
   - The Windows bundle name is looked up at send time with a releaseStore helper
     `latestInstallBundle("windows")`, which matches `install-windows*`.
   - **Windows only for now.**
   - The row is left out when `PUBLIC_BASE_URL` is unset or no Windows bundle is published.
     `FRONTEND_BASE_URL` is internal, so it is not used here.
   - New i18n key `email.appDownloadLabel` in `common.json` (en/cs/de).
   - The password-reset email is unchanged.
7. **Install bundle name.** The two explorations disagree (`install-windows-x64.zip` vs
   `install-windows-x86_64.zip`), so nothing is hard-coded. The page lists whatever `install-*` files
   the release folder holds, using releaseStore's `INSTALL_RE`.

## Acceptance criteria
- **A1.** Unit tests:
  - with base `https://malenia.feld.cvut.cz/koubic`, `audio/illustrations/phonation_a.wav` and
    `/audio/illustrations/phonation_a.wav` both resolve to
    `https://malenia.feld.cvut.cz/koubic/audio/illustrations/phonation_a.wav`;
  - absolute http(s) URLs are unchanged;
  - `../../x.wav` and `file:` are rejected;
  - `sync`, `localFileFor` and `prune` agree on the key.
- **A2.** `./gradlew :app:test :updater:test :shared:test` is green.
- **A3.** `extConfig` tests cover four cases:
  - `appVersion` 1.0.2 and 1.1.0 → relative path, even with `ASSET_BASE_URL` unset;
  - 1.0.1 → absolute;
  - missing or garbage → absolute;
  - garbage and unset `ASSET_BASE_URL` → no field.
  - The golden test is updated and backend `npm test` is green.
- **A4.** Backend tests for both new routes:
  - `/version/download/latest/<name>`: 302 with the relative Location; 404 when nothing is
    published; 404 for an unlisted name; HEAD works.
  - `GET /app-release`: master gets 200; flagged user gets 200; unflagged user gets 403;
    no release → `{release:null}`; the `PUBLIC_BASE_URL` field is passed through.
- **A4b.** Email tests (`emailService` / `userController` tests):
  - with `PUBLIC_BASE_URL` set and a Windows bundle published, the welcome HTML contains the
    `…/api/version/download/latest/install-windows…zip` link;
  - with either missing, the row is absent and the email still sends;
  - user creation never fails because of a release lookup error.
- **A5.** Frontend:
  - the AppShell test shows the menu item for master and for a flagged user, and hides it for an
    unflagged user;
  - a page test renders the version, the links and the copy button (calls `navigator.clipboard.writeText`);
  - the i18n parity test (en/cs/de) passes;
  - `npm run build` succeeds.
- **A6.** Against share_web after deploy:
  - `curl -I http://192.168.122.183:10001/api/version/download/latest/<install>` → 302, and following
    it gives 200 with a matching sha256;
  - the page renders in the browser (Playwright e2e, or a screenshot);
  - creating a test user sends a welcome email whose Windows link points at malenia
    (you check the inbox).
- **A7.** A 1.0.2 build pointed at the test container plays the example. A 1.0.1 request
  (`curl …/site-config/<token>?appVersion=1.0.1`) still gets the absolute URL.
- **A8.** You confirm from outside the internal network:
  - `https://malenia.feld.cvut.cz/koubic/audio/illustrations/phonation_a.wav` returns 200;
  - the `latest` link downloads through malenia;
  - a malenia install shows and plays the example.
- **A9.** Spec docs amended:
  - `NewShare/docs/Task_Configuration_JSON_Spec.md:184`;
  - `docs/Project_Specification.md:1447` (only after you OK the wording);
  - web `docs/ext_app_Task_Configuration_JSON_Spec.md`;
  - web `docs/newshare_changes.md`;
  - web `docs/container_deployment.md` (new `PUBLIC_BASE_URL` env and the latest alias).

## Increments (two worker agents, each in its own git worktree; I review between steps)
1. **Desktop worker (NewShare, worktree off `old_ui`).**
   - Add `resolveExampleUrl` and wire it into `KtorExampleAudioCache.kt` (`fileNameFor` :131, `sync` :56,
     `localFileFor` :51).
   - Pass `SERVER_BASE_URL` in through the constructor, wired at `AppContainer.kt:102`.
   - Update the KDoc in `domain/config/ExampleAudioCache.kt`.
   - Add tests to `KtorExampleAudioCacheTest.kt`.
   - Bump `gradle.properties` `appVersion` to 1.0.2.
   - → **Checkpoint:** diff + A1/A2 green.
2. **Web worker, in parallel (task_protocoller_web_app, worktree off `newshare`).**
   - `extConfig.js` :241/:258 gains a `relativeAssets` option.
   - `siteController.js:414` computes it from `req.query.appVersion` with x.y.z integer comparison,
     reusing releaseStore's `compareKeys`/`SEMVER_RE` (export them if needed).
   - Check whether `deriveConfigVersion` hashes the audio paths. If so, note that configVersion now
     differs per client generation, which is acceptable.
   - Add the latest route in `routes/version.js` and a `latestInstallBundles()` helper in `releaseStore.js`.
   - Add a new `routes/appRelease.js` mounted behind `requireAuth` in `server.js`.
   - Add `can_see_technical` to the login payload.
   - Add the Windows download link to the invite email (decision 8).
   - Frontend:
     - new `frontend/src/api/appRelease.js` (pattern: `api/mcpTokens.js`);
     - new `pages/appRelease/AppReleasePage.jsx` (pattern: `pages/users/UsersListPage.jsx`, with
       `PageHeader` and `useToast` for "Copied");
     - route in `App.jsx`, gated like `MasterOnly` but allowing the technical flag;
     - `NavItem` in `AppShell.jsx:134`;
     - new i18n namespace `appRelease` (en/cs/de) registered in `i18n/index.js`, plus a `nav.json` label.
   - → **Checkpoint:** diff + A3/A4/A5 green, and a screenshot of the page from the local dev server.
3. **Docs (both workers).** Amend the docs per A9, and save this spec as
   `docs/app_release_page/spec.md` (web) and `docs/SPEC-example-audio-links.md` (desktop).
   - → **Checkpoint:** you approve the Project_Specification wording.
4. **Release 1.0.2** via `docs/dev/releasing.md` (`publishWindowsRelease`).
   - → **Checkpoint: needs your go-ahead.** Then check that `/version/latest` reports 1.0.2.
5. **Deploy the web change to share_web.**
   - Use the `deploy_share` skill (Routine redeploy, tar variant).
   - First check that the server's backend matches `newshare`.
   - Add `PUBLIC_BASE_URL` to `/opt/task-protocoller/backend/.env`.
   - → **Checkpoint: needs your go-ahead.** Then run the A6/A7 checks.
6. **Your outside-network check (A8).** Then run `/verify`, and commit/merge on `old_ui`/`newshare`
   with the Co-Authored-By trailer.

## Assumptions (veto any)
- Gate version **1.0.2** = the next release and the first one that resolves relative paths.
- The `/audio/illustrations/*.wav` files are reachable through malenia (unverified; A8).
- The menu label is "App release" (cs "Verze aplikace", de "App-Version"). It sits under Admin, not
  in a new section.
- A technical-flag user sees only this admin item, not Users.
- The "invite email" is the admin welcome email sent on `POST /users`. No other invite mail exists.
- `PUBLIC_BASE_URL` is a new env on share_web. It is not `FRONTEND_BASE_URL`, which stays internal
  for email links.

## Out of scope
- Release history list.
- Uploading or withdrawing releases from the UI.
- Changing `ASSET_BASE_URL` on the server.
- Updater self-update.
