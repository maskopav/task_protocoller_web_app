# Dependency upgrade (batch 4u)

Date: 2026-10-25. Node 24.22.1, npm 11.19.1. No holds. Spec §10 criterion 18 is met except the items marked "to do at the checkpoint".

## 1. Versions, before to after

Direct dependencies only. "Before" is the installed version at the start of the batch.

### frontend

| Package | Before | After |
|---|---|---|
| vite | 7.3.6 | 8.3.5 |
| @vitejs/plugin-react | 5.0.3 | 6.1.2 |
| @vitejs/plugin-basic-ssl | 2.1.4 | 2.3.0 |
| vitest | 4.1.11 | 5.0.5 |
| @vitest/coverage-v8 | 4.1.11 | 5.0.5 |
| jsdom | 29.1.1 | 30.1.3 |
| typescript | 5.9.3 | 7.0.2 |
| eslint | 9.39.2 | 10.13.0 |
| @eslint/js | 9.39.2 | 10.0.1 |
| eslint-plugin-react-hooks | 5.2.0 | 7.1.1 |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.7 |
| globals | 16.4.0 | 17.13.0 |
| i18next | 25.5.2 | 26.5.11 |
| react-i18next | 16.0.0 | 17.1.9 |
| @mediapipe/tasks-vision | 0.10.32 | 1.1.1 |
| colorjs.io | 0.6.1 | 0.7.1 |
| react, react-dom | 19.1.1 | 19.3.1 |
| react-router-dom | 7.18.2 | 7.18.4 |
| react-quill-new | 3.7.0 | 3.8.3 |
| @headlessui/react | 2.2.9 | 2.2.10 |
| dompurify | 3.4.14 | 3.4.17 |
| @playwright/test | 1.62.1 | 1.64.1 |
| @types/react, @types/react-dom | 19.2.0 | 19.3.0 |
| baseline-browser-mapping | 2.11.18 | 2.11.33 |

### backend

| Package | Before | After |
|---|---|---|
| vitest | 4.1.11 | 5.0.5 |
| i18next | 25.7.4 | 26.5.11 |
| dotenv | 17.2.3 | 18.0.9 |
| nodemailer | 9.0.5 | 10.2.1 |
| express | 5.1.0 | 5.3.0 |
| mysql2 | 3.15.3 | 3.24.6 |
| cors | 2.8.5 | 2.8.6 |
| express-rate-limit | 8.7.0 | 8.7.1 |
| i18next-fs-backend | 2.6.7 | 2.6.9 |
| nodemon | 3.1.10 | 3.1.14 |
| supertest | 7.2.2 | 7.3.1 |

`npm outdated` is empty in both packages after the batch. `npm ci --dry-run` succeeds in both.

## 2. Steps and checks

| Step | Result |
|---|---|
| 0 Baseline | frontend 130 tests, backend 665 tests, build OK, lint 235 problems (212 errors, 23 warnings) |
| 1 `npm update` | frontend 130/130. Backend 663/665: see B1. Fixed, then 665/665. Golden 5/5 |
| 2 vitest 5, coverage, jsdom 30 | frontend 130/130 (and `test:coverage` runs). Backend 664/665: see B2. Fixed, then 665/665. Golden 5/5 |
| 3 vite 8, plugin-react 6, basic-ssl | build OK, 130/130, dev server over HTTPS answers 200 for `/` and `/src/main.jsx` |
| 4 eslint 10 and plugins | see B3. Lint 66 problems. Build OK, 130/130 |
| 5 i18next 26, react-i18next 17 | golden 5/5, backend 665/665, frontend 130/130, build OK |
| 6 mediapipe 1.1.1 | API review only, see B5. Build OK, 130/130 |
| 7 colorjs.io, dotenv, nodemailer, typescript 7 | all tests pass. See B6 to B8 |

## 3. Breaking changes met and how each was resolved

- **B1 mysql2 3.15 to 3.24 (via `npm update`).** JSON-typed columns now come back already parsed. Two assertions in `backend/test/integration/validationUpdate.test.js` (lines 86 and 110) called `JSON.parse` on an object. A small `asObj` helper (declared just above `read`) parses only when the value is a string. Application code was already tolerant: every `parseJson` helper in `src/` returns non-strings unchanged. No `src/` change.
- **B2 Vitest 5: `clearMocks` now defaults to true.** `backend/src/routes/upload.test.js` ("logging", line 466) asserts on `logToFile` calls recorded by earlier tests, so it failed. `backend/vitest.config.js` now sets `clearMocks: false` (with a comment), which keeps the Vitest 4 behaviour. The cleaner fix is to make that test self-contained. Not done, to avoid changing test intent.
- **B3 ESLint 10 and eslint-plugin-react-hooks 7 (`frontend/eslint.config.js`).**
  - `reactHooks.configs['recommended-latest']` is gone from the flat config. It is now `reactHooks.configs.flat.recommended`.
  - The plugin's recommended set now includes React Compiler rules. Five of them are switched off with a comment: `set-state-in-effect` (41 hits), `refs` (9), `purity` (2), `static-components` (2) and `immutability` (2). Fixing them means restructuring components, which would change behaviour. `rules-of-hooks` and `exhaustive-deps` stay on.
  - `globalIgnores` gained `coverage` and `public`. `public/` holds vendored minified bundles (flac, vad) that were producing 169 of the 235 baseline problems, and ESLint 10 adds `no-useless-assignment` hits inside them.
  - New ESLint 10 rules `no-useless-assignment` and `preserve-caught-error` found 5 real spots, fixed without behaviour change:
    - `src/components/ProtocolEditor/TaskList.jsx:72`
    - `src/hooks/useVideoRecorder.js:203`
    - `src/pages/AdminLoginPage.jsx:45` and `:56` (`{ cause: err }`)
    - `scripts/sync-tasks.js:56` (`{ cause: err }`)
- **B4 i18next 26: `initImmediate` removed in favour of `initAsync`.** `backend/src/utils/emailService.js:23` changed to `initAsync: false`. The frontend init (`src/i18n/index.js`) uses no removed option. The backend `extConfig.js` reads the JSON files directly, so the golden config output is unaffected (golden 5/5, fixtures untouched). react-i18next 17 only changes auto-generated `<Trans>` keys for kept HTML nodes; every `<Trans>` with a key uses an explicit `i18nKey`, and `FormattedText.jsx` uses `defaults`.
- **B5 MediaPipe tasks-vision 1.1.1 (`frontend/src/hooks/useVideoRecorder.js`).** Checked against `vision.d.ts`: `FilesetResolver.forVisionTasks(basePath)`, `FaceLandmarker.createFromOptions(fileset, {baseOptions{modelAssetPath, delegate}, outputFaceBlendshapes, runningMode, numFaces})`, `detectForVideo(video, timestamp)` and `result.faceLandmarks[][]` are all unchanged. One real change: the wasm fileset was loaded from the CDN at `@0.10.3` while the npm bundle was 0.10.32, which is a mismatch. The bundle and wasm must come from the same release, so line 74 now pins the CDN path to `@1.1.1` (the file exists on jsDelivr).
- **B6 colorjs.io 0.7.** `munsellUtils.js` uses `new Color("xyz", ...)`, `toGamut({space, method: "oklch.chroma"})` and `toString({format: "rgb"})`. I ran 7 sample XYZ inputs through 0.6.1 and 0.7.1: the output strings are identical. No code change.
- **B7 dotenv 18.** Changes are the CLI, `.env.vault` removal and the log moving to stderr. The app uses `dotenv.config()` and `dotenv/config` only. No change.
- **B8 nodemailer 10.** Only change is Node 20 or newer. A `jsonTransport` send works, and `emailService.js` loads and runs `sendPasswordResetEmail` without API errors. A real SMTP send was not done, see section 8.
- **B9 typescript 7.** Used only by the Playwright specs. `playwright test --list` loads all 80 tests in 15 files. Nothing in `tsconfig.json` needed changing.
- **Vite 8 (rolldown).** No config change needed. The build warning text now names `build.rolldownOptions...codeSplitting` instead of `rollupOptions`. The bundle is still one 3.2 MB chunk, as before.

Pre-existing issue noticed, not touched: `src/components/VideoRecorder/VideoRecorder.jsx:96` uses `faceMessage`, which is not defined (`no-undef`).

## 4. Holds

None.

## 5. npm audit

| | Before | After |
|---|---|---|
| frontend, `--omit=dev` | 2 (1 low, 1 critical: quill XSS via react-quill-new) | 2 low (same two packages) |
| frontend, full | 11 (1 low, 4 moderate, 5 high, 1 critical) | 2 low (quill 2.0.3 and react-quill-new, GHSA-v3m3-f69x-jf25) |
| backend, `--omit=dev` | 6 (2 moderate, 3 high, 1 critical) | 0 |
| backend, full | 11 (4 moderate, 6 high, 1 critical) | 0 |

The 2 low findings remain: `npm audit` says a fix exists, but the batch limits itself to `npm install <pkg>@latest`, and `npm outdated` is already empty. No high or critical findings remain.

## 6. Lint, tests, build

| | Before | After |
|---|---|---|
| Frontend lint | 235 problems (212 errors, 23 warnings) | 66 problems (43 errors, 23 warnings) |
| Frontend lint, same scope (`public/` excluded) | 66 (43 errors) | 66 (43 errors) |
| Frontend tests | 16 files, 130 tests | 16 files, 130 tests |
| Backend tests | 36 files, 665 tests | 36 files, 665 tests |
| Frontend build | OK | OK (Vite 8) |

## 7. Golden test

`backend/test/integration/siteConfigGolden.test.js`: 5/5 after step 1, step 2, step 5, step 7 and at the end. Run against the `tp-mariadb` container. `UPDATE_GOLDEN` was never set and the fixtures are untouched.

## 8. Node, engines, CI, server

- `engines.node` frontend: `^22.22.2 || ^24.15.0 || >=26` (highest minimum: jsdom 30). Backend: `^22.12.0 || ^24.0.0 || >=26` (vitest 5, dev only; runtime packages need only Node 20: nodemailer 10).
- `.nvmrc` at the repo root: `24`.
- `.github/workflows/deploy.yml`: `node-version: '24'` (was `'20'`). Nothing else touched.
- Server: `docs/container_deployment.md` installs `nodejs` from `apt` on Ubuntu 26.04. That is likely a Node 22 line, but I could not verify the exact minor. The server runs only `node server.js` with runtime dependencies (nodemailer needs 20 or newer, nothing else is stricter). Run `node -v` on the server: `^22.12.0` or newer satisfies the backend `engines`. The frontend `engines` only matters in CI, where the build happens. The server and the doc were not changed.
- Yet to do at the checkpoint: a real password-reset email against the dev mail setup (only `jsonTransport` and a module load were checked here).

## 9. To do at the checkpoint

1. Run the Playwright e2e suite (not run in this batch, as requested). `playwright test --list` loads all 80 tests.
2. Manual camera check (MediaPipe 1.1.1):
   1. Start the app (`npm run dev` in `frontend/`, backend running) and open the participant recorder route that shows the camera preview (the video-recorder step of a task with a face check).
   2. Allow the camera. The "loading model" state should end within a few seconds. In the browser network tab, `vision_wasm_internal.wasm` should load from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm`, and the console should show no errors.
   3. Face the camera. Guidance text and arrows should change as you turn left or right, move off-centre, and move closer or further. With a camera that supports zoom, auto-zoom should still react.
   4. Cover the lens or step away. The "no face" guidance should appear and recover.
   5. Record a short clip and check that it completes and the result screen shows.
   6. Take a screenshot of the preview with guidance visible.
3. Check one Czech and one German screen with `<Trans>` text (for example the audio intro and the completion screen) for correct formatting after react-i18next 17.

## Open items (2026-10-25)

- **Camera check postponed** by the user. This Windows Server VM has no camera, and the upgraded code isn't deployed yet. Run the manual camera check above on the test server after the next deploy, before the redesign is released.
- Server Node version is still unverified. Run `node -v` on the server; it must satisfy `engines` (≥ 22.12).
- E2E suite and one real password-reset email are still to be run at a checkpoint.
