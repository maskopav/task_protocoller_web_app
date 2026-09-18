# Decision table: aligning the site-config API between the web app and the external Kotlin app

## Context

The external desktop app (SHARE) fetches its config via `GET /site-config/:token`. Today the endpoint returns the web app's **native** protocol serialization (built by `assembleProtocol()` in `backend/src/controllers/protocolController.js`, served by `getSiteConfig` in `backend/src/controllers/siteController.js`) — transformation to the app's format was deliberately deferred (`docs/newshare_changes.md`). The external app's normative format is `docs/ext_app_Task_Configuration_JSON_Spec.md` + `docs/ext_app_full_example_config.json`. This document decides, per aspect, which framework changes. **No implementation — planning artifact only.**

## Current-state summary

**Web response**: `{ site: {name, config_json}, projects: [{id, name, protocols: [{id, name, version, language_id, language_code, randomization, required_identifiers, use_audio_guide, info_text, instructions_text, global_contents, tasks: [{id, task_id, task_order, params, contents}]}]}] }`
- `required_identifiers` = array of string ids against a hardcoded 5-entry frontend catalogue (`frontend/src/components/Identifiers/IdentifierFields.js`) — no regex/placeholder/help/required metadata anywhere.
- Tasks are numeric `task_id` + free-form `params`; instructions are per-language HTML (Quill) or i18n text — no localization keys.
- `sites.config_json` = free-form JSON, raw textarea in `SiteModal.jsx`, echoed verbatim.
- `recordingsFileName`, `protocolInstructionsPdfUrl`, `schemaVersion`/`configVersion`, `strings` — nothing in the web app.
- Language variants of a protocol are served as **separate protocol entries**; the ext app expects one protocol + multi-language `strings` map.

**Ext app config**: flat top level `{schemaVersion, configVersion, defaultLanguage, languages, defaultMicName, enableEditor, indicatorType, patientFields[], protocols[], strings}`; protocols `{name, protocolInstructionsPdfUrl, recordingsFileName, tasks[]}`; tasks typed `VOCAL|QUESTIONNAIRE|CALIBRATION|INFO|VIDEO` with all text via keys. No projects grouping, `patientFields` are global (not per-protocol), CALIBRATION is a mandatory in-protocol task.

## Agreed principles (user decisions)

1. Web emits the ext app's format: mapping layer on the web backend generates localization **keys + `strings` map** — ext parser unchanged where possible.
2. Identifiers = **catalogue + custom**: a shared catalogue of well-known identifiers (jointly defined — some have app-side semantics, e.g. auto-rendered `currentDate`, `sex` with fixed options) plus per-protocol custom fields.
3. Site settings edited via a **structured form** in the web app (replacing the raw JSON textarea).
4. Unsupported web task categories (vision/cognitive/motoric) are **skipped** by the mapping layer; the protocol is still served.
5. App settings pushed from web must **not override local edits** in the ext app's Settings.
6. `CALIBRATION` moves out of protocols → app setting `useCalibration`.
7. Protocol `info_text`/`instructions_text` (InfoPage/Instructions) are dropped from the config.
8. `useInFilename` on identifiers is dropped — filename composition lives entirely in `recordingsFileName`.

## Decision table

Legend: **Web** = this repo (backend mapping layer + admin UI/DB). **Ext** = Kotlin desktop app. **Joint** = requires a shared agreement/artifact.

| # | Aspect | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Web app change | Ext app change |
|---|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|----------------|
| 1 | **Endpoint & credential** | Ext adopts the web's endpoint; the spec's placeholder `GET /api/config/{installationId}` becomes `GET /site-config/:token` with the site `access_token` as credential. `installationId` stays a **local** ext-app setting (several devices can share one site token) and remains available as a filename variable.                                                                                                                                                                                                                                                                                                       | None | Point config fetch at `/site-config/:token`; store site token in Settings; handle web's `404`/`403` bodies |
| 2 | **Top-level envelope** | Web emits the ext format (`schemaVersion`, `configVersion`, settings keys, `projects`, `strings`) instead of the native dump. Mapping layer lives in `getSiteConfig` as a transform over `assembleProtocol()` output — no second serializer. `configVersion` generated server-side (e.g. from latest relevant `updated_at`). All flags emitted as real JSON booleans (web's `use_audio_guide` etc. are 0/1 tinyints today — must convert).                                                                                                                                                                               | New mapping module used by `getSiteConfig`; emit `schemaVersion: 1` + generated `configVersion` | None (validates as today) |
| 3 | **Projects → protocols menu** | Config gains a two-level structure: `projects: [{name, protocols: [...]}]` replacing the flat top-level `protocols[]`. Ext app renders a two-level picker (project → protocol). Web already groups by project.                                                                                                                                                                                                                                                                                                                                                                                                           | Emit `projects[{name, protocols}]` in ext format | Schema change: parse `projects[]`; new two-level selection screen |
| 4 | **App settings** (`defaultLanguage`, `languages`, `defaultMicName`, `enableEditor`, `indicatorType`, `useCalibration`) | Set in web per site; stored in `sites.config_json` as these exact keys; merged into the config top level by the mapping layer. Ext app treats server values as defaults: a key **locally modified in Settings wins** (ext tracks per-key "locally overridden" state).                                                                                                                                                                                                                                                                                                                                                    | Replace raw-JSON textarea in `SiteModal.jsx` with a typed form (dropdowns/checkboxes); backend validates known keys in `siteController` | Per-key local-override merge logic (server value applied only if key not locally modified) |
| 5 | **CALIBRATION** | Removed as a protocol task. New app setting `useCalibration: true/false` (from web, row 4). When `true` and a protocol contains ≥1 `VOCAL` task, the ext app **synthesizes** the calibration screen at the beginning of the protocol. `optimalLoudness` becomes an general ext-app default/local setting (the mechanism described in point 4 - App settings).                                                                                                                                                                                                                                                            | Include `useCalibration` in the settings form; never emit `CALIBRATION` tasks | Drop the "protocol must contain CALIBRATION" config validation; synthesize calibration from the flag; keep `optimalLoudness` locally |
| 6 | **Identifiers ↔ patientFields — placement** | Protocol-specific: `patientFields` moves from the config top level **into each Protocol object**. Ext app shows them after protocol selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Emit `patientFields` per protocol | Schema change: read `patientFields` from the protocol; show the form post-selection |
| 7 | **Identifiers — data model** | Catalogue + custom. Web protocol editor offers (a) catalogue entries picked by stable `name` — the ext app may attach special semantics to these (auto-filled `currentDate`, fixed-option `sex`, …) — and (b) fully custom fields defined inline. Each field carries `{name, labelKey, helpKey, placeholder, regex, required}`; `useInFilename` dropped. Stored as an array of objects in the existing `protocols.required_identifiers` JSON column (no schema migration; rename optional). Labels/help resolved via `strings`.                                                                                          | Rework identifier editor (`ProtocolEditor.jsx` identifier modal, `IdentifierFields.js`) from checkbox-list to catalogue-picker + custom-field form; store objects; emit `labelKey`/`helpKey` + strings | Drop `useInFilename` handling and `${patientCode}` composition (see row 8); implement catalogue-name semantics |
| 7a | **Identifier catalogue definition** | **Joint deliverable**: a shared list of well-known identifier `name`s with their app-side behavior (which are auto-rendered, which have fixed options, their default regex/placeholders). Must exist before either side implements row 7.                                                                                                                                                                                                                                                                                                                                                                                | Encode catalogue in web (seed of the picker) | Encode matching semantics per catalogue name |
| 8 | **`recordingsFileName`** | New protocol property, edited in the web protocol editor. Variables: app-side `${installationId}`, `${taskIndex}`, `${task.subtype}`, `${repetition}` + **identifier values by name** (e.g. `${field.code}`), replacing the `useInFilename`/`${patientCode}` mechanism. Web validates on save: template must include `${taskIndex}`; identifier variables must reference fields defined on that protocol. Ext keeps its own load-time validation.                                                                                                                                                                        | New protocol column (or JSON field) + editor input with variable palette + save validation; emit in config | Extend template resolver with `${field.<name>}`; remove `${patientCode}` composition (or keep as deprecated alias) |
| 9 | **`protocolInstructionsPdfUrl`** | New optional protocol property in the web editor (plain URL field).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Add to protocol model + editor; emit | None |
| 10 | **Protocol properties dropped from the config** | `info_text`, `instructions_text`, `global_contents` (consent etc.), `randomization`, `version`, `language_id`, internal ids — all omitted by the mapping layer. InfoPage/Instructions chips can stay in the editor for the in-browser preview, but are not sent to sites (optional later cleanup). If a closing screen is wanted, the mapping can emit a static final `INFO` task instead (decide at implementation).                                                                                                                                                                                                    | Mapping omits these fields | None (unknown keys are ignored anyway) |
| 11 | **Language variants** | Web serves language variants of a protocol as separate entries; ext expects one protocol + `strings.<lang>`. Mapping layer **merges sibling variants** (same `protocol_group_id`, `is_current`) into one ext protocol, contributing each variant's texts to its language's `strings` map. Top-level `languages` = union of variant languages ∩ site setting.                                                                                                                                                                                                                                                             | Variant-merging logic in the mapping layer | None |
| 12 | **Task mapping** | Mapping layer resolves `task_id` → web task definition (`tasksBase.ts` category/name) → ext `type` + `subtype` + `titleKey` + fields: `length` ← duration param, `nrepetition` ← repeat, `instructionKeys` ← generated keys over the task's i18n instructions, `showIndicator`, `canRepeat`, `canSkip`, `havePTZ` (VIDEO). Category map: voice→`VOCAL`, camera→`VIDEO`, questionnaire→`QUESTIONNAIRE`; vision/cognitive/motoric **skipped** (logged). Web params that don't exist yet (`canRepeat`, `canSkip`, `showIndicator`, `havePTZ`) become admin-editable params in `tasksBase.ts` where relevant, with defaults. | Task-mapping table + new `tasksBase.ts` params + key generation; questionnaire `params.questions` → ext Question objects (`questionType/questionKey/questionTextKey/questionRegex/questionOptions`) | None |
| 12a | **Task-name → `subtype` mapping** | **Joint deliverable**: agreed table web task name → ext `subtype` (`PHONATION`, `PATAKA`, `SYLLABLES`, `READING`, `MONOLOGUE`, `RETELLING`, `COUNTING`, `CUSTOM`, `EMOTIONS`, …), incl. which web tasks fall back to `CUSTOM`.                                                                                                                                                                                                                                                                                                                                                                                           | Encode in the mapping layer | Confirm/extend the subtype enum |
| 13 | **`audioExamplePath`** | Ext expects app-bundled asset paths (`audio_instructions/aaa.wav`). Web can only reference assets that ship with the ext app. **Joint deliverable**: agreed asset name per standard task; mapping emits the path for those tasks only. (Alternative — serving audio over URL — is an ext change; defer.)                                                                                                                                                                                                                                                                                                                 | Emit agreed paths in mapping | Confirm bundled asset list |
| 14 | **`strings` / localization** | Web builds the full `strings.<lang>` maps: task titles/instructions from `frontend/src/i18n/<lang>/tasks.json` (resolving `{{placeholder}}` params server-side, per web conventions), identifier labels/help, questionnaire texts/options. Text conversion: web HTML/markup → ext inline `<bold>/<italic>` + `\n\n` paragraphs; `instructionKeys` = one key per paragraph. Key naming convention generated deterministically (e.g. `p<protocolId>_t<order>_instr<i>`).                                                                                                                                                   | Key generation + strings assembly + markup conversion in the mapping layer; i18n files become a backend input (already copied to `backend/locales/` at build) | None |
| 15 | **Ext-app caching/snapshot behavior** | Unchanged (cache to `data/config/config.json`, offline fallback, per-session snapshot).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None | None |

## Suggested sequencing (for later implementation)

1. Joint deliverables first: identifier catalogue (7a), subtype map (12a), audio asset list (13) — cheap, unblock everything.
2. Web data-model + editor work: identifiers (7), `recordingsFileName` (8), `protocolInstructionsPdfUrl` (9), settings form (4), new task params (12).
3. Web mapping layer (2, 3, 6, 10–14) — one module, covered by unit tests against `docs/ext_app_full_example_config.json` as the golden shape.
4. Ext app: endpoint/token (1), projects menu (3), per-protocol patientFields (6), settings merge (4), calibration synthesis (5), filename variables (8).

## Verification (when implemented)

- Backend unit test: `getSiteConfig` output validates against the ext spec (schema-shape assertions incl. `${taskIndex}` in every `recordingsFileName`, real booleans, every referenced key present in every `strings.<lang>`).
- E2E `site-config.spec.ts` updated to the new shape; token non-leakage assertion kept.
- Manual: feed the produced JSON to the ext app's config validator.

---

## Final decisions & instructions for the ext app devs (2026-09-18)

The web side of this table is **implemented** on branch `newshare` (`backend/src/utils/extConfig.js` is the mapping layer; `GET /site-config/:token` now returns the ext format). The notes the ext devs added to their copy of the table were resolved as follows.

### Row 1 — one token per site; `installationId` is a tracing field, not a credential

- `GET /site-config/:token` keeps **one `access_token` per site**. Every computer of a site uses the same token and receives the identical config.
- Identifying the computer is still useful — but as a **separate field next to the site token, with no effect on the config**. The ext app keeps its local `installationId` and sends it together with the site token on every recording upload (phase B); the server stores it on the corresponding session row solely to trace the origin device when hunting bugs or bad data. It remains available as the `${installationId}` filename variable.

### Row 3 — keep `projects: [{ name, protocols: [...] }]`

The ext note suggested the flat top-level `protocols[]` is enough. We keep the two-level structure on purpose: a site inherits protocols from **several** projects, and protocol names do not necessarily tell which study they belong to. The picker in the ext app should therefore show **project → protocol**, so the examiner sees which project a protocol is part of. Parsing change: read `projects[].protocols[]` instead of `protocols[]`.

### Row 4 — settings keys

Top level now carries exactly: `defaultLanguage`, `languages`, `defaultMicName`, `defaultMicGain` (number), `enableEditor`, `indicatorType` (`CIRCLE`|`WAVEFORM`), `useCalibration`. As agreed in the note, the ext app simply applies the server values (no local-override tracking required on the web side). All flags are real JSON booleans.

### Row 5 — no `CALIBRATION` tasks

Never emitted. When `useCalibration` is `true` and a protocol contains at least one `VOCAL` task, the ext app synthesizes the calibration screen; `optimalLoudness` is an ext-app setting. THIS DOESNT MEAN THE CALIBRATION IS DROPPED - it was just moved from tasks to general settings.

### Rows 7/8 — `recordingsFileName` stays a per-protocol template (ext proposal declined)

The ext note proposed a fixed app-side name (`{patient_code}-{clinic_id}-{date}`) with the server renaming uploads later. We keep the template because:

- the same clip name exists on the device, in the upload and on the server — no rename step, no reconstruction from uploaded JSON in phase B;
- uniqueness is structural: the web refuses to save a template without `${taskIndex}`;
- the ext app already has the template resolver; the only extension is the identifier variable.

Variables: `${installationId}`, `${taskIndex}`, `${task.subtype}`, `${repetition}`, and **`${field.<name>}`** = the value the examiner entered for the patient field with that `name` (sanitize to `[a-zA-Z0-9_-]`). `${patientCode}` and `useInFilename` are gone; `${field.patient_code}` replaces them. The web prefills new protocols with `${field.patient_code}_${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}`; protocols created before this change fall back to `${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}`.

### Rows 6/7/7a — `patientFields` per protocol; identifier catalogue

`patientFields` lives **inside each protocol**. Each field is `{ name, labelKey, helpKey, placeholder, regex, required }` (`useInFilename` dropped; `helpKey` is always present, its string may be empty). The web emits **no options** — for catalogue names the ext app owns the rendering:

| `name` | ext-app behaviour | web defaults |
|---|---|---|
| `current_date` | **auto-filled** with the examination date, not editable | required |
| `sex` | fixed options **`male`, `female`** | required |
| `education` | fixed options **`less than upper secondary`, `upper secondary and vocational`, `tertiary education`** | optional |
| `patient_code` | free text | regex `[A-Za-z0-9_-]+`, placeholder `HC001`, required |
| `surname` | free text | optional |
| `year_of_birth` | free text | regex `\d{4}`, placeholder `1965`, optional |
| anything else | **custom** field: free text validated by `regex` (empty = no validation) | as configured |

Stored values go to `participant.json` under `name`. Labels/help are resolved through `strings.<lang>` like every other text.

### Row 12/12a — task mapping and subtypes

| web task | ext `type` / `subtype` |
|---|---|
| `phonation` | `VOCAL` / `PHONATION` |
| `syllableRepeating` with syllable `pataka` | `VOCAL` / `PATAKA` |
| `syllableRepeating` with any other syllable (`ta`, `ka`, …) | `VOCAL` / `SYLLABLES` |
| `retelling` | `VOCAL` / `RETELLING` |
| `reading` | `VOCAL` / `READING` (the text to read is the last instruction paragraph) |
| `monologue`, `dynamic_monologue` | `VOCAL` / `MONOLOGUE` |
| any other voice task added to the web later | `VOCAL` / **`CUSTOM`** |
| `questionnaire`, `rbdsq`, `hhies`, `feedback` | `QUESTIONNAIRE` |
| `d15colour` (vision), `sdmt` (cognitive) | **skipped** (logged on the server; the protocol is still served) |

**`CUSTOM`** = a generic `VOCAL` screen with no app-side special behaviour: Start/Stop/Repeat flow, `length` timer, title and instructions entirely from the config, no example audio unless `audioExamplePath` is present. `COUNTING` and `EMOTIONS`/`VIDEO` are not produced by the web today.

Field sources: `length` ← task duration (or min/max duration), `nrepetition` ← repetitions, `canRepeat`/`canSkip`/`showIndicator` ← admin-editable task flags (defaults: repeat on, skip off, indicator on for phonation/syllables). Questionnaire: `length` is emitted as the task duration or **300** when unset — please confirm what `length` means for `QUESTIONNAIRE`. Question types: open → `OPEN` (`questionRegex` `.+`, or `.*` when optional), single/dropdown → `SINGLE_CHOICE`, multiple → `MULTIPLE_CHOICE`, emoji rating → `SINGLE_CHOICE` with options `rating_1`…`rating_5`. Web-only question features (`exclusiveOption`, write-in options, optional choice questions, questionnaire description) are not emitted.

### Row 13 — `audioExamplePath` is an absolute URL

As proposed in the note, the app downloads resources itself: `audioExamplePath` is now an **absolute `https://…` URL** (e.g. `https://<web-host>/test/dist/audio/illustrations/phonation_a.wav`), emitted only for phonation /a/, pa-ta-ka, and the Puss-in-Boots / Red-Riding-Hood retellings. Download and cache it when a new config is received; absent key = no example button.

### Rows 10/11/14 — what else changed in the envelope

- Language variants of a protocol are merged into **one** protocol; texts of each variant go to `strings.<lang>`. `languages` = the variant languages of the site's protocols ∩ the site setting.
- Keys are deterministic: `p<protocolGroup>_t<taskOrder>_title`, `…_instr<i>`, `…_q<i>`, `…_q<i>_text`, `…_q<i>_o<j>`, `p<protocolGroup>_f_<fieldName>_label|_help`, `rating_1..5`. Every key referenced anywhere exists in every `strings.<lang>`.
- Inline markup is `<bold>`/`<italic>`; paragraphs are separate `instructionKeys`.
- No `INFO` closing task, no internal ids, no `version`, `randomization`, `info_text`, `instructions_text`, `global_contents`.
- `configVersion` = `YYYY-MM-DD.HHMMSS` (UTC) of the newest change to the site or any of its protocols.

### Sample configs for testing

`docs/ext_app_samples/*.json` — nine legitimate outputs of the web platform (single protocol, multi-project, merged language variants, skipped vision task, all questionnaire types, full identifier catalogue + custom fields + legacy ids, empty settings, language-restricted site, pre-change legacy protocol). Regenerate with `node backend/scripts/gen-ext-configs.js` (no database needed); `backend/src/utils/extConfig.test.js` asserts the spec invariants over the same fixtures.
