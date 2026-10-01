# TaskProtocoller Web App — Exploration Report (branch `newshare`)

Read-only exploration, 2026-09-30. Repo: `/home/tomas/IdeaProjects/task_protocoller_web_app`.

Line numbers refer to the working tree as it was when this report was written, before the `recordVideo` change. Working-tree state at the time: `backend/package.json` was modified (one added line, the `db:samples` script), and `EXPLORATION_REPORT.md`, `backend/src/runExtSamplesSeed.js` and `package-lock.json` were untracked.

Headline findings:
- `recordVideo` already existed as a voice-task param in `tasksBase.ts`. It was never emitted by `extConfig.js`.
- `havePTZ` appeared only in docs.
- There was no ext-config spec inside this repo. The one the code points to lived in sibling repos.
- There is no `adminEditable` flag anywhere in `tasksBase.ts`.

---

## 1. Overall architecture

### Layout

There is no root `package.json`. The repo root holds `README.md`, `backend/`, `frontend/`, `docs/`, a stray `package-lock.json` (untracked) and `EXPLORATION_REPORT.md` (untracked). The two apps are independent npm projects.

**Frontend** (`/frontend`): React 19, Vite, ESM (`"type": "module"`), react-router-dom 7, i18next / react-i18next, headlessui, react-quill-new, mediapipe. Tests are Vitest plus Playwright e2e.

| Path | Contents |
|---|---|
| `frontend/src/App.jsx`, `main.jsx` | Entry point and routing |
| `frontend/src/pages/` | Admin pages (dashboard, project/site/protocol management, `ProtocolEditorPage`) and `ParticipantInterfacePage` (the preview runner) |
| `frontend/src/components/` | `ProtocolEditor/`, `Recorder/`, `VisionTask/`, `SDMTTask/`, `Questionnaire/`, `Identifiers/`, `InfoToolTip/`, and others |
| `frontend/src/config/tasksBase.ts` | Task catalogue |
| `frontend/src/tasks.ts` | `createTask` factory |
| `frontend/src/utils/translations.ts` | Param and i18n resolution |
| `frontend/src/i18n/{cs,de,en}/` | `tasks.json`, `admin.json`, `common.json` (en also has `intro.json`) |
| `frontend/src/api/` | API clients (`apiClient.js`, `sites.js`, `protocols.js`, ...) |
| `frontend/src/hooks/` | `useProtocolManager.js`, `useProtocolActions.js`, ... |
| `frontend/scripts/sync-tasks.js` | i18n/tasksBase consistency checker |
| `frontend/e2e/` | Playwright specs |

**Backend** (`/backend`): Express 5, mysql2 (MariaDB), ESM, jsonwebtoken, bcrypt, helmet, cors, express-rate-limit, i18next, nodemailer. Tests are Vitest plus supertest.

| Path | Contents |
|---|---|
| `backend/server.js` | App wiring. Line 98: `app.get("/site-config/:token", siteConfigLimiter, getSiteConfig)`. helmet and CORS allowlist from `CORS_ORIGIN` at lines 40-60. |
| `backend/src/controllers/` | `protocolController.js` (`assembleProtocol`), `siteController.js` (`getSiteConfig`), ... |
| `backend/src/routes/`, `middleware/`, `db/connection.js` | Routing, auth and DB pool |
| `backend/src/utils/` | `extConfig.js`, `fieldValidation.js`, `emailService.js`, ... |
| `backend/scripts/schema/` | `create_tables.sql`, `create_views.sql`, `drop_tables.sql`, `alter_permissions.sql`, `compareSchemas.js` |
| `backend/scripts/seed/` | `seed_all.sql`, `artificial_data.sql`, `e2e_seed.sql` |
| `backend/scripts/gen-ext-configs.js` | Sample generator |

### DB and migrations

- The DB is MariaDB.
- There are no incremental migrations. `node src/runInit.js` drops and recreates everything: `drop_tables.sql`, then `create_tables.sql`, `create_views.sql` and the seed. This is stated in `docs/newshare_changes.md` ("Migration note").
- `runSqlFile.js` splits scripts naively on `;`, so no semicolons are allowed inside SQL strings or comments.

### Frontend/backend communication

- REST over HTTPS. `frontend/src/api/apiClient.js` (`apiFetch`) attaches the JWT Bearer token.
- Admin endpoints require JWT.
- `GET /site-config/:token` is public, gated by the site token.
- The desktop (ext) app is a third client that only calls `/site-config/:token`.
- The frontend build copies `src/i18n/*` into `backend/locales` (see the `build` script below). The backend reads those translations server-side to build the ext config.

### Commands

**Backend** (`backend/package.json`):

| Command | Script |
|---|---|
| `npm start` | `node server.js` |
| `npm run dev` | `nodemon server.js` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` |
| `npm run db:samples` | `node src/runExtSamplesSeed.js` (uncommitted addition) |
| `npm run db:test:reset` | `node --env-file=.env.test src/runInit.js && node --env-file=.env.test src/runE2ESeed.js` |
| `npm run db:views` | `node src/applyViews.js` |
| `npm run db:permissions` | `node src/applyPermissions.js` |
| `npm run db:sql` | `node --env-file=.env src/dbConsole.js` |
| `npm run start:test` | `node --env-file=.env.test server.js` |
| `npm run db:schema:diff` | `node scripts/schema/compareSchemas.js` |

`backend/vitest.config.js` uses the node environment and includes `src/**/*.{test,spec}.js`.

**Frontend** (`frontend/package.json`):

| Command | Script |
|---|---|
| `npm run dev` | `vite --mode development` |
| `npm run build` | `vite build --mode production && shx mkdir -p ../backend/locales && shx cp -r src/i18n/* ../backend/locales/` |
| `npm run lint` | `eslint .` |
| `npm test` | `vitest run` |
| `npm run test:coverage` | `vitest run --coverage` |
| `npm run dev:e2e` | `vite --mode e2e --port 5183 --strictPort` |
| `npm run test:e2e` | `playwright test` |

There are also `verify:*` and `benchmark:flac` scripts. `frontend/vitest.config.js` uses the node environment and includes `src/**/*.{test,spec}.{js,jsx,ts,tsx}`.

---

## 2. Task definitions (`frontend/src/config/tasksBase.ts`, 204 lines)

### Types (lines 3-24)

```ts
export interface TaskParamDef {
  default: any;
  values?: string[];     // enum values are actually pulled from i18n
  multiple?: boolean;    // multiselect
  recordVideo?: boolean; // vestigial on the interface
}
export interface TaskBase {
  type: "voice" | "camera" | "motoric" | "questionnaire" | "vision" | "cognitive";
  recording: RecordingMode;   // basicStop | countDown{duration} | delayedStop{duration}
  params: Record<string, TaskParamDef>;
  useVAD?: boolean; repeat?: number; illustration?: string;
}
```

- **Categories.** The `type` union is `voice | camera | motoric | questionnaire | vision | cognitive`. The DB `task_types` seed also has `hearing` (`seed_all.sql:13-20`).
- **Param types are not declared.** `getAllParams()` infers them in `frontend/src/utils/translations.ts:80-131`:
  - If the i18n tree has `params.<p>.values`, the type is `enum`, or `multiselect` when `multiple: true`.
  - Otherwise the type comes from `typeof default`: `boolean`, `number` or `text`.
  - `default: []` or `default: ""` becomes `text` (the `questions` array is handled by `QuestionnaireModal`).
- **Defaults.** `getDefaultParams()` (`translations.ts:209-230`) returns each `def.default`. If it is undefined, it falls back to `[]` for `multiple`, or to the first i18n value for enums.
- **No "admin-editable" flag exists.** Every param in `params` is shown in `TaskModal`. Whether a param is admin-visible is defined purely by being listed in `params`. The header comment (lines 26-29) says `canRepeat`, `canSkip` and `showIndicator` are "admin-editable params" kept inline without a helper, because `frontend/scripts/sync-tasks.js:34-58` `eval()`s the object literal.
- `tasksBase` carries no labels or help text. Those live in i18n.

### Boolean param declaration excerpt (e.g. phonation, lines 45-59)

```ts
phonation: {
  type: "voice",
  recording: { mode: "basicStop"},
  useVAD: false,
  params: {
    phoneme: { default: "a" },
    repeat: { default: 1 },
    minDuration: { default: 10 },
    maxDuration: { default: 60 },
    recordVideo: { default: false },
    canRepeat: { default: true },
    canSkip: { default: false },
    showIndicator: { default: true },
  },
},
```

### Every voice-category task, verbatim

| Task | Lines | Recording and `useVAD` | Params |
|---|---|---|---|
| `phonation` | 45-59 | `basicStop`, `useVAD: false` | `phoneme: "a"`, `repeat: 1`, `minDuration: 10`, `maxDuration: 60`, `recordVideo: false`, `canRepeat: true`, `canSkip: false`, `showIndicator: true` |
| `syllableRepeating` | 61-74 | `countDown` duration 7, `useVAD: false` | `syllable: "pataka"`, `repeat: 1`, `duration: 7`, `recordVideo: false`, `canRepeat: true`, `canSkip: false`, `showIndicator: true` |
| `retelling` | 76-90 | `delayedStop` duration 90 | `fairytale: "pussInBoots"`, `repeat: 1`, `duration: 90`, `minDuration: 30`, `maxDuration: 120`, `recordVideo: false`, `canRepeat: true`, `canSkip: false`, `showIndicator: false` |
| `reading` | 92-105 | `basicStop` | `topic: "northWind"`, `repeat: 1`, `minDuration: 0`, `maxDuration: 150`, `recordVideo: false`, `canRepeat: true`, `canSkip: false`, `showIndicator: false` |
| `monologue` | 107-121 | `delayedStop` duration 60 | `topic: "hobbies"`, `repeat: 1`, `duration: 60`, `minDuration: 30`, `maxDuration: 120`, `recordVideo: false`, `canRepeat: true`, `canSkip: false`, `showIndicator: false` |
| `dynamic_monologue` | 123-137 | `delayedStop` duration 60, `useVAD: true` | `topics: { default: ["everyday","hobbies","travel","eating"], multiple: true }`, `duration: 60`, `minDuration: 30`, `maxDuration: 120`, `recordVideo: false`, `canRepeat: true`, `canSkip: false`, `showIndicator: false` |

Those are the only six voice tasks. There are no others (no `counting`, no camera or motoric tasks).

Non-voice tasks:
- `questionnaire` (33-43), `rbdsq` (169-179), `hhies` (181-191) and `feedback` (193-203). All have `title`, `description`, `questions: []`, `canRepeat: true`, `canSkip: false`. The standard ones use empty defaults, and the real content comes from i18n `defaultContent`.
- `d15colour` (139-150, vision). It has `randomize: true`, `repeat: 1`, `version`, `demoTrial`, `showNumbers` and `maxDuration: 180`, with `values` arrays on three of them.
- `sdmt` (152-163, cognitive). It has `duration: 90`, `showKeypad` and `symbolOrdering`.

`recordVideo` is a string/boolean flag read downstream with `String(x) === 'true'` checks (see section 9).

### Task ids

DB `tasks` seed order (`seed_all.sql:22+`): phonation 1, syllableRepeating 2, retelling 3, reading 4, monologue 5, questionnaire 6, rbdsq 7, hhies 8, d15colour 9, dynamic_monologue 10, sdmt 11, feedback 12. The generator hard-codes ids 1-10 (`gen-ext-configs.js:20-24`).

---

## 3. Protocol editor UI

### Components

- `frontend/src/components/ProtocolEditor/ProtocolEditor.jsx`. `handleCreateTask(category)` is at lines 181-213. It builds `{type, category, recording, ...getDefaultParams(category)}` (lines 205-210) and opens `TaskModal`. Questionnaire-type tasks open `QuestionnaireModal` instead, pre-filled from i18n `defaultContent`.
- `TaskList.jsx` is the "available tasks" pool. It shows an `InfoTooltip` with the task description (line 65) and inline param defaults.
- `ProtocolForm.jsx` lists the added tasks.
- `TaskModal.jsx` (145 lines) renders the params.

### How params render (`TaskModal.jsx`)

- `const params = getAllParams(category)` (line 39).
- The loop (lines 56-141) renders `<label>{paramInfo.label}</label>`. After that, the first matching branch applies:
  - `type === "multiselect"`: a checkbox group (lines 73-96).
  - `type === "boolean"`: a single checkbox (lines 98-106).
  - Values from i18n: a `<select>` (lines 108-124).
  - Otherwise: an `<input>`, `number` or `text`.
- **Boolean excerpt (lines 98-106):**

```jsx
) : paramInfo.type === "boolean" ? (
  <input
    type="checkbox"
    checked={value === true || value === "true"}
    onChange={(e) =>
      setEditingData((prev) => ({ ...prev, [param]: e.target.checked }))
    }
  />
```

  Legacy string `"true"` is tolerated on read. On write, real booleans are stored.
- **A new boolean param therefore needs only `{ default: true|false }` in `tasksBase.ts`.** The checkbox appears automatically.
- Number inputs call `Number(e.target.value)` (line 133).

### Labels and help text

- **Labels are in i18n, not `tasksBase`.** `translateParamName` (`translations.ts:52-57`) looks up `<category>.params.<param>.label` in the `tasks` namespace. If missing, it falls back to the raw param key. There is no per-param help text or tooltip in `TaskModal`.
- Help text exists only at task level: `<category>.description` (shown in the `TaskList` tooltip and via `translateTaskDescription`).
- **`recordVideo` has no label key in any `tasks.json`.** The modal would currently show the raw text "recordVideo". It does render as a checkbox, because its default is boolean.
- Existing label examples, `en/tasks.json:86-88`. The `en` file is nested one level deeper than `cs`/`de` for these categories, so mind indentation:

```json
"canRepeat": { "label": "Allow repeat" },
"canSkip": { "label": "Allow skip" },
"showIndicator": { "label": "Show level indicator" },
```

- Czech (`cs/tasks.json:83-85`) is "Povolit opakování" / "Povolit přeskočení" / "Zobrazit indikátor hlasitosti".
- German (`de/tasks.json:70-72`) is "Wiederholen erlauben" / "Überspringen erlauben" / "Pegelanzeige anzeigen".

### Files that need new keys for a new voice param

Add `"<param>": { "label": "..." }` under `params` of each voice category in all three files, six times each:
- `frontend/src/i18n/en/tasks.json`: phonation (~line 83), syllableRepeating (~116), retelling (~148), reading (~181), monologue (~222), dynamic_monologue (~257).
- `frontend/src/i18n/cs/tasks.json`: the matching blocks, with `canRepeat` at lines 83, 108, 133, 155, 188.
- `frontend/src/i18n/de/tasks.json`: the matching blocks, with `canRepeat` at lines 70, 95, 120, 142, 175.

The `cs` file has `canRepeat` in a different set of blocks than `en` (see the earlier grep). `frontend/scripts/sync-tasks.js` (it reads `tasksBase.ts`, i18n path `./frontend/src/i18n`, langs `en`/`cs`/`de`) checks that every `tasksBase` param has a label in each language. It is interactive and uses readline. Run it from the repo root: `node frontend/scripts/sync-tasks.js`.

---

## 4. Persistence

- Table `protocol_tasks` (`backend/scripts/schema/create_tables.sql:87-93`) has `id`, `protocol_id`, `task_id`, `task_order` and **`params JSON`**. The column comment even asks "vs each param as new column??". It is one JSON column per task row, not a per-param table.
- Unique index `(protocol_id, task_order)` at line 164, FKs at lines 192 and 194.
- `tasks` holds only `category` and `type_id` (FK to `task_types`).
- **Save path.** `useProtocolManager.js:27-33` sends `tasks: tasks.map((task, i) => ({ task_id, task_order: i+1, params: task }))`. The **whole flat editor task object** is the params blob, including `category`, `type`, `recording` and any `task_order` or `id` it carries. `protocolController.js:199-203` runs `INSERT INTO protocol_tasks ... JSON.stringify(t.params || {})`.
- **Load path.** `assembleProtocol()` (`protocolController.js:285-298`) selects `params` and runs `parseJson(t.params, {})`. On the frontend, `mapProtocolWithNames` (`useProtocolActions.js:96-107`) spreads `...t.params` back into a flat task and re-derives `category` from `task_id`.
- **Type conversions.**
  - There is no 0/1 conversion for task params, because the JSON holds real booleans. The editor stores real booleans for checkboxes.
  - Legacy and string forms exist: `recordVideo: "true"` strings (the generator's `legacy_protocol` fixture uses `recordVideo: "true"`). The runtime reads them via `String(...) === 'true'` (`translations.ts:186-192` comments, `Recorder.jsx:77`).
  - Old rows saved before `canRepeat`, `canSkip` and `showIndicator` existed lack those keys, so `extConfig.js` must apply defaults.
  - 0/1 values exist only in protocol columns (`is_current`, `use_audio_guide`, `is_archived`) and in `sites.is_active`, not in params.
- Defaults are not applied at load. Tasks are persisted as saved and the ext mapper applies fallbacks.

---

## 5. Ext-config mapping (`backend/src/utils/extConfig.js`, 385 lines)

### Overview

`buildExtConfig({site, projects, tasksById, locales, assetBaseUrl, now})` (line 218) is a pure function. It returns `{config, skipped}`. Only `loadLocales()` touches the disk. The same function serves `GET /site-config/:token` and the fixture generator. `SCHEMA_VERSION = 1` and `LANGS = ["en","cs","de"]`.

**Constants and helpers**
- `CATALOGUE` (25-32): the 6 well-known identifiers, with `LEGACY_ID_MAP` (33) mapping `external_id`, `last_name`, `birth_year` and `gender` onto them.
- `VOCAL_SUBTYPE` (39-46), `SHOW_INDICATOR_DEFAULT` (47), `AUDIO_PARAM` / `AUDIO_EXAMPLES` (51-52), `RATING_LABELS` and `RATING_KEYS` (56-61).
- `SETTINGS_DEFAULTS` (63-71): `defaultLanguage "en"`, `languages []`, `defaultMicName ""`, `defaultMicGain` (undefined, omitted when unset), `enableEditor false`, `indicatorType "CIRCLE"`, `useCalibration true`.
- `UI_PLACEHOLDERS` (74): `example`, `playStory`.
- `loadLocales(baseDir)` (85-96): reads `tasks.json` and `common.json` per language. The directory is `I18N_PATH` if set, otherwise `frontend/src/i18n`. Results are cached, and read errors yield `{}`.
- `settingsOf` (108-120): type-coerces the known settings and validates mic gain via `isValidMicGain`.
- `htmlToParagraphs` (127-141): HTML to paragraphs with `<bold>` / `<italic>`.
- `catText`, `paramValues` and `resolveText` (144-167): `{{placeholder}}` resolution with fallback to `en`.
- `taskTexts` (170-188): builds title plus paragraphs. `monologue` appends `instructionsTopic`. `dynamic_monologue` appends one topic paragraph per selected topic. `reading` appends the passage text as the last paragraph.
- `QUESTION_TYPE` (190): open to `OPEN`, single/dropdown/rating to `SINGLE_CHOICE`, multiple to `MULTIPLE_CHOICE`.
- `toDate` / `formatVersion` (193-202): `configVersion` format `YYYY-MM-DD.HHMMSS` in UTC.

### Boolean/number coercion helpers (lines 102-106)

```js
const bool = (v, dflt) => {
  if (v === undefined || v === null || v === "") return dflt;
  return typeof v === "string" ? v === "true" : Boolean(v);
};
const num = (v, dflt) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? dflt : Number(v));
```

The helper is named `bool` (not `toBool`). Strings other than `"true"` become `false`. Numbers and others become `Boolean(v)`. Defaults apply for undefined, null or `""`. `bool` is also used for `required` on patient fields and for boolean site settings.

### Voice to VOCAL (lines 262-318)

Subtype resolution (line 263):

```js
const subtype = VOCAL_SUBTYPE[category]?.(params) ?? (type === "voice" ? "CUSTOM" : null);
if (!isQuestionnaire && !subtype) { skipped.push({ protocol: name, order: task.task_order, category }); continue; }
```

Mapping (39-46):

| Web category | Ext subtype |
|---|---|
| `phonation` | `PHONATION` |
| `syllableRepeating` | `PATAKA` if `syllable === "pataka"`, otherwise `SYLLABLES` |
| `retelling` | `RETELLING` |
| `reading` | `READING` |
| `monologue` | `MONOLOGUE` |
| `dynamic_monologue` | `MONOLOGUE` |

Common fields (269-274):

```js
const common = {
  titleKey: `${P}_title`,
  canRepeat: bool(params.canRepeat, true),
  canSkip: bool(params.canSkip, false),
  nrepetition: isQuestionnaire ? 1 : Math.max(1, num(params.repeat, 1)),
};
```

`P = p${gid}_t${task.task_order}`, where gid is the primary variant's `protocol_group_id ?? id`.

The VOCAL object (299-318):

```js
const primaryTexts = taskTexts(category, params, defaultLanguage, locales);
const n = Math.max(1, primaryTexts.paragraphs.length);
for (const lang of languages) { /* put title + _instr1.._instrN into strings[lang] */ }
const vocal = {
  type: "VOCAL",
  subtype,
  ...common,
  instructionKeys: Array.from({ length: n }, (_, i) => `${P}_instr${i + 1}`),
  length: num(params.duration, num(params.minDuration, 0) || num(params.maxDuration, 0)),
  showIndicator: bool(params.showIndicator, SHOW_INDICATOR_DEFAULT[category] ?? false),
};
const audio = audioUrl(category, params);
if (audio) vocal.audioExamplePath = audio;
tasks.push(vocal);
```

- `SHOW_INDICATOR_DEFAULT` is `{phonation: true, syllableRepeating: true}`, and everything else is `false`.
- **`recordVideo` is never read or emitted** by this function.
- The paragraph count `n` comes from the default language, so every key exists in every `strings.<lang>`.
- `audioUrl` (236-240): emits `${assetBaseUrl}/audio/illustrations/<category>_<paramValue>.wav` only for `AUDIO_EXAMPLES` (`phonation_a`, `syllableRepeating_pataka`, `retelling_pussInBoots`, `retelling_redRidingHood`) and only when `assetBaseUrl` is set.

### CUSTOM fallback

Any task whose web `type === "voice"` but is not in `VOCAL_SUBTYPE` becomes `VOCAL` / `CUSTOM` (line 263). Text comes entirely from config keys. There is no example audio, because `AUDIO_PARAM` has no entry for it. Today all six voice categories are in the map, so `CUSTOM` is currently only reachable by future voice tasks.

### QUESTIONNAIRE and INFO (lines 276-297)

- Triggered by `type === "questionnaire"` (the DB `task_types.type`, not category). That covers `questionnaire`, `rbdsq`, `hhies` and `feedback`.
- Questions map to `{questionType, questionKey: P_q<i>, questionTextKey: P_q<i>_text}`. `OPEN` adds `questionRegex` (`.*` if `q.optional`, else `.+`). Choice types add `questionOptions`. Rating uses the fixed `rating_1..5` keys (labels from `RATING_LABELS`). Other choice types use `P_q<i>_o<j>`.
- The questionnaire title is `(lp.title || params.title).trim() || taskTexts(...).title`. Per-language texts come from `paramsFor(lang, order)`, which finds the variant's task at the same `task_order`.
- Emitted as `{ type: "QUESTIONNAIRE", ...common, questions, length: num(params.duration, 300) }`. Note that `common` includes `canRepeat`, `canSkip` and `nrepetition: 1`.
- **`INFO` is never emitted.** The doc decisions drop it. `CALIBRATION` is never emitted either (replaced by the `useCalibration` setting). `VIDEO` is not produced.
- Skipped: vision, cognitive, motoric and camera types are pushed to `skipped` and logged.

### Envelope (lines 371-384)

`schemaVersion`, `configVersion`, `siteName`, `defaultLanguage`, `languages`, `defaultMicName`, optional `defaultMicGain`, `enableEditor`, `indicatorType`, `useCalibration`, flat `protocols[]`, `strings`.

Per protocol (348-353): `name`, `version`, `project`, optional `protocolInstructionsPdfUrl`, `recordingsFileName` (default `DEFAULT_RECORDINGS_FILE_NAME` from `fieldValidation.js`), `patientFields`, `tasks`.

Other behaviours:
- Language variants (same `protocol_group_id`) are merged. The primary variant is `byLang[defaultLanguage] ?? byLang.en ?? variants[0]`.
- `languages` = union of variant languages, intersected with the site's `languages` setting (fallbacks at 227-229).
- A protocol linked to several projects appears once per project (356-369).
- `configVersion` is the newest `updated_at` of the site or any protocol (233-234).

### `GET /site-config/:token` (`backend/server.js:98`; handler `siteController.js:395-460`)

- Rate limited (`siteConfigLimiter`) and public.
- Looks up `sites` by `access_token`. 404 `{error:"Invalid token"}` for unknown. 403 if `is_active = 0`.
- Reads the spine from the view `v_site_protocols` (project, protocol, `language_code`, only active projects and current protocols). Reads `tasks ⨝ task_types` to build `tasksById`. Calls `assembleProtocol(id)` once per protocol and sets `assembled.protocol.language_code`.
- Calls `buildExtConfig({... locales: loadLocales(), assetBaseUrl: process.env.ASSET_BASE_URL || "", now: new Date()})`. Logs each skipped task as WARN. Responds `res.json(config)`. 500 on error.
- The token is never echoed.

---

## 6. Tests (`backend/src/utils/extConfig.test.js`, 218 lines)

- **Runner:** Vitest. `cd backend && npm test`, or `npx vitest run src/utils/extConfig.test.js`.
- **Fixtures:** none are stored. The test imports `CASES`, `SAMPLE_TOKEN`, `generateAll` from `../../scripts/gen-ext-configs.js` (line 3) and builds `all = generateAll(loadLocales())`, using the real `frontend/src/i18n` files. A `proto()` builder mirrors `assembleProtocol()` output.
- **Invariants run over every fixture (`describe` per case, lines 22-60):**
  - Envelope: `schemaVersion === 1`, `configVersion` regex, `siteName`, integer `version >= 1`, `typeof enableEditor/useCalibration === 'boolean'`, mic gain in 0-100 when present, `indicatorType` in CIRCLE/WAVEFORM, `languages` contains `defaultLanguage`.
  - For every task: `typeof t.canRepeat === 'boolean'`, `typeof t.canSkip === 'boolean'`, integer `nrepetition >= 1`, and for VOCAL `typeof t.showIndicator === 'boolean'` (lines 34-38).
  - Only `VOCAL` and `QUESTIONNAIRE` types are emitted. Every `recordingsFileName` contains `${taskIndex}`.
  - Every referenced key (title, instruction, question, option, label and help keys) exists in every language's strings.
  - No leaks of `"id"`, `"task_id"`, `"config_json"`, `"site"`, `"global_contents"`, `"randomization"` or the sample token.
- **Case specifics (lines 63-200):**
  - `single_en`: subtypes `['PHONATION','PATAKA','READING','MONOLOGUE','RETELLING']`. Phonation `toMatchObject({length:10, showIndicator:true, audioExamplePath:...})`. Reading length 150 (min 0 falls back to max), and its passage is the last paragraph.
  - `multi_project`, `variants_en_cs`, `skipped_vision`, `questionnaires` (the custom questionnaire has `canRepeat:false, canSkip:true, length:300, nrepetition:1`).
  - `identifiers_full`, `empty_settings`, `restricted_languages`.
  - `legacy_protocol`: the string `recordVideo: "true"` fixture, plus the NULL filename template.
  - Empty-site config, and `audioExamplePath` omitted when `assetBaseUrl` is `''`.
- The test also has unit blocks for `htmlToParagraphs` (lines 203-211) and `resolveText` (lines 213-218).
- **There are no assertions on `recordVideo`.** None of the fixtures sets `canRepeat`, `canSkip` or `showIndicator` explicitly (the generator's `DEFAULTS` omit them at `gen-ext-configs.js:33-41`), so the existing tests cover only the default fallbacks, not explicit true/false or string-coercion paths for those three params.
- Related: `backend/src/controllers/siteController.test.js:363` asserts a VOCAL SYLLABLES object including `canRepeat: true, canSkip: false`. It is a second place that would need updating if the VOCAL shape gains a field.
- E2E: `frontend/e2e/site-config.spec.ts` hits the endpoint with the seeded token.

---

## 7. Samples

### `backend/scripts/gen-ext-configs.js` (188 lines)

- It reads no DB and no seed. It uses hand-built native fixtures (header comment: "no database needed").
- It exports `CASES`, `tasksById`, `SAMPLE_TOKEN` (`sample00...`), `proto()` and `generateAll(locales)`. `CASES` has nine functions: `single_en`, `multi_project`, `variants_en_cs`, `skipped_vision`, `questionnaires`, `identifiers_full`, `empty_settings`, `restricted_languages`, `legacy_protocol`.
- It reads locale files via `loadLocales()`. The `standardQuestionnaire()` helper pulls `defaultContent` from `tasks.json`, mimicking `ProtocolEditor.handleCreateTask`.
- `DEFAULTS` (33-41) are copied by hand from `tasksBase.ts` and include `recordVideo: false` but not `canRepeat`, `canSkip` or `showIndicator`. A new tasksBase default means a manual `DEFAULTS` update here if samples should reflect it.
- Constants: `NOW` 2026-09-18T12:00Z, `ASSETS = "https://example.org/test/dist"`.
- Run: `node backend/scripts/gen-ext-configs.js` (from the repo root). The `process.argv[1]` guard (line 181) means it only writes files when run directly, not when imported. It writes `docs/ext_app_samples/<case>.json` with `JSON.stringify(config, null, 2)` and a trailing newline. It prints skipped tasks per case.
- `docs/ext_app_samples/` holds the nine `*.json` files, matching the case names.

### `backend/src/runExtSamplesSeed.js` (untracked, 132 lines)

Related, and it is a consumer of the same fixtures. It imports `CASES` and `tasksById` from the generator. It inserts each case into a real DB as one site per case, named "Sample <case>" with token `sample_<case>`. It also inserts projects, protocols, `protocol_tasks` (params as JSON, with task ids resolved by category in the target DB), `project_protocols` and `site_projects`. `--reset` deletes previous samples first. It calls `refuseInProduction` and runs inside a transaction. It is wired via `npm run db:samples`. That script is the only change in the modified `backend/package.json`. The aim is to browse and edit each sample in the web UI.

---

## 8. Docs

### Ext config spec: not in this repo (at the time of exploration)

- No `docs/ext_app_Task_Configuration_JSON_Spec.md` and no `docs/ext_app_full_example_config.json` exist here. No "§4.1 VOCAL" doc exists in this repo. These files are only referenced by:
  - `backend/src/utils/extConfig.js:5`
  - `backend/src/controllers/siteController.js:395`
  - `frontend/e2e/site-config.spec.ts:22`
  - `docs/newshare_changes.md:95`
  - `docs/config_alignment_decision_table.md:5`
- Also referenced but missing: `docs/desktop_upload_spec_draft.md` (linked from `newshare_changes.md`).
- Outside the repo, the actual spec exists at `/home/tomas/IdeaProjects/ShareAppNewDemo/docs/Task_Configuration_JSON_Spec.md` and `/home/tomas/IdeaProjects/shareapp/Task_Configuration_JSON_Spec.md`. Its **§4.1 VOCAL** (line 142) already lists `recordVideo` as an optional field.
- `recordVideo` in the external spec's JSON example is `"recordVideo": false`. The spec says it is optional, defaults to `false`, films each take alongside the audio, and replaces the `indicatorType` widget on that screen. It says there are no PTZ controls, and that `VIDEO` tasks (§4.5) have them.
- The external copy of `config_alignment_decision_table.md` also exists there. The `/home/tomas/IdeaProjects/shareapp` copy was not compared against the one in `ShareAppNewDemo`.

### `docs/config_alignment_decision_table.md` (147 lines)

A planning and decision document. It covers aligning `GET /site-config/:token` between the web app and the Kotlin desktop app.
- Context, current-state summary, and eight agreed principles: web emits the ext format, catalogue plus custom identifiers, a structured site-settings form, unsupported categories skipped, no local-override tracking, calibration becomes `useCalibration`, `info_text`/`instructions_text` dropped, `useInFilename` dropped.
- A 15-row decision table: endpoint/credential, envelope, project grouping, app settings, calibration, `patientFields`, `recordingsFileName`, PDF URL, dropped props, language variant merging, task mapping, `audioExamplePath`, `strings`, caching.
- **Row 12** is the task-mapping row. It says `canRepeat`, `canSkip`, `showIndicator` and `havePTZ` (VIDEO) "become admin-editable params in `tasksBase.ts` where relevant". Its category map is voice to `VOCAL`, camera to `VIDEO`, questionnaire to `QUESTIONNAIRE`.
- Then sequencing, a verification plan, and a "Final decisions (2026-09-18)" section marking the web side as implemented. The final decisions cover:
  - Token per site.
  - Flat `protocols[]` with `project` (revised 2026-09-23).
  - Settings keys.
  - No `CALIBRATION`.
  - `recordingsFileName` kept as a template with `${field.<name>}`.
  - The patient-field catalogue behaviours.
  - The subtype table (this is the clearest statement of the voice to `VOCAL`/`CUSTOM` mapping), noting that `COUNTING` and `EMOTIONS`/`VIDEO` "are not produced by the web today".
  - The `audioExamplePath` URL policy.
  - Deterministic key naming.
  - Pointers to the sample files.

### `docs/newshare_changes.md` (305 lines)

A branch changelog for `newshare`. The app is repurposed so that sites (clinics) running an external desktop app fetch config via an access token.
- **DB:**
  - New `sites`, `site_projects` and `user_sites` tables.
  - Removed participant/session/recording tables.
  - New views `v_site_protocols` and `v_user_site_assignments`.
  - `protocols.recordings_file_name` and `instructions_pdf_url`.
  - `required_identifiers` is now stored as objects.
- **Backend:**
  - Removed participant routers.
  - `GET /site-config/:token` response example.
  - `/sites` and `/user-sites` tables.
- **Frontend:**
  - Removed participant flows and flow settings.
  - Kept the preview runner.
  - New site-management pages.
- **Also covered:** tests, e2e `.env.test` requirements, seeds, and project/site attribute cleanup.
- **Items relevant to the task:**
  - The ext config response is described as emitting `showIndicator`, `canRepeat`, `canSkip`, `nrepetition`.
  - It states that `buildExtConfig` and `gen-ext-configs.js` drive each other.
  - `ASSET_BASE_URL` is a new env var.

Also present: `docs/container_deployment.md` (273 lines, test-container manual that sets `I18N_PATH` and `ASSET_BASE_URL`). The root `README.md` and `backend/README.md` were not examined.

---

## 9. Existing mentions of `recordVideo`, `video`, `havePTZ`

Excluding `node_modules`, `dist` and the untracked root report:

**`recordVideo` (functional code):**
- `frontend/src/config/tasksBase.ts:14` (interface), `:54, 69, 85, 100, 116, 132` (all six voice tasks, `default: false`).
- `frontend/src/pages/ParticipantInterfacePage.jsx:119, 468-472, 502, 696, 719, 999`. It treats `recordVideo` as `String(...) === 'true'`, runs audio-only if the user declines video, and passes it to `Recorder`.
- `frontend/src/components/Recorder/Recorder.jsx:55, 77` (`isVideoEnabled = String(recordVideo) === 'true'`).
- `frontend/src/utils/translations.ts:40, 45, 187` (comments on pre-calibration and post-calibration video instruction screens, and on string `"true"/"false"`).
- `backend/scripts/gen-ext-configs.js:34-39` (defaults) and `:173` (the string `"true"` in `legacy_protocol`).
- There are no i18n label keys and no backend `extConfig.js` reference.

**`havePTZ`:** only in `docs/config_alignment_decision_table.md:47` (row 12), plus the untracked root report. It does not appear in any code.

**Video infrastructure (not ext-related):** `frontend/src/components/VideoRecorder/`, `hooks/useVideoRecorder.js`, `VideoRecorderTest.jsx`, `main_video_test.jsx`, `i18n` `instructionsPreCalibration` / `instructionsPostCalibration` strings, and the `camera` task type in `tasksBase`'s type union and `task_types` seed. The external spec §4.1 and §4.5 define `recordVideo` and `VIDEO` on the ext side.

---

## 10. The root `EXPLORATION_REPORT.md` (untracked, 496 lines)

- It is an earlier report (compiled 2026-08-25), written before the `newshare` branch implemented the mapping. It targets a feature called "Desktop Config Generator + upload receiver".
- Structure:
  - Report 1: ShareApp config JSON spec (from `/home/tomas/IdeaProjects/ShareAppNewDemo/docs`), including top-level, protocol, VOCAL, QUESTIONNAIRE, CALIBRATION, INFO, VIDEO and PatientField definitions, `strings`, and versioning.
  - Report 2: web app architecture (stack, routing, backend, styling, testing).
  - Report 3: upload handling and project scoping.
  - Appendix: the mock server.
- Its line 35 says the spec is `docs/Task_Configuration_JSON_Spec.md`, in the `ShareAppNewDemo` repo. This confirms the spec belongs to the ext repo.
- Relation to the current state: it is stale background. It describes the old participant-based app (the participant layer has since been removed), a `projects` level, and a global `patientFields`, all since superseded. It also mentions the older ext spec version (it describes INFO, CALIBRATION and VIDEO as emitted tasks, while the web now emits only VOCAL and QUESTIONNAIRE). Its mention of `havePTZ` (lines 185-190, 226, 250, 253) is about the ext-side VIDEO task.
- It is not tracked in git. The two should be treated as complementary: that one documents the external spec as of August, and this one documents the implemented web side as of now.

---

## Appendix: change surface for a new boolean voice param

1. `frontend/src/config/tasksBase.ts`: add `<param>: { default: <bool> }` to each voice task. No other registration is needed; the checkbox renders automatically.
2. `frontend/src/i18n/{en,cs,de}/tasks.json`: add `params.<param>.label` for six categories each (18 entries).
3. `backend/src/utils/extConfig.js`: in the `vocal` object (lines 308-315), add `<param>: bool(params.<param>, <default>)`.
4. `backend/scripts/gen-ext-configs.js`: `DEFAULTS` already includes `recordVideo: false`.
5. `backend/src/utils/extConfig.test.js`: extend the boolean-type invariant (lines 34-38), and add a case for the string `"true"` coercion. The `legacy_protocol` fixture already carries `recordVideo: "true"` for `syllableRepeating`.
6. `backend/src/controllers/siteController.test.js:363`: update the expected VOCAL object if it is a strict match.
7. Regenerate `docs/ext_app_samples/*.json` via `node backend/scripts/gen-ext-configs.js`.
8. Documentation: update `docs/config_alignment_decision_table.md` (row 12 and the Final decisions subtype table) and `docs/newshare_changes.md`.
