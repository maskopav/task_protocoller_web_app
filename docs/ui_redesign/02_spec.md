# UI redesign: specification

**Status:** draft for approval, 2026-10-25. Updated at the mockup checkpoint: F-008 is decided (free name, with the desktop app's file-name form shown as a hint), received studies stay a separate group, the protocol library is added (§6.10), and all dependencies are upgraded to their latest versions (criterion 18, plan batch 4u).
**Inputs:**
- the [audit](01_audit.md)
- the interview decisions, recorded in the plan file and below
- the NewShare E2E findings (`../NewShare/docs/testing/e2e/findings.md`)

**Precedence:** when this spec and the code or older docs disagree, this spec wins for UI, navigation, access and the admin API. [`../newshare_changes.md`](../newshare_changes.md) stays authoritative for the upload pipeline. The **desktop contract (§7) beats everything**.

---

## 1. Goal

The web app becomes the place where a study is set up and its recordings are reviewed. It should need no explanation, so a clinician can use it on day one without training.

**Success measures:**
- Anyone can say in one sentence where any object lives.
- Every page has exactly one obvious next action.
- A clinician with one clinic never sees a choice between one option.

## 2. Users

| Persona | Clinics | Typical work |
|---|---|---|
| **Clinician (point of contact at a clinic)** | 1 | Reviews recordings from the clinic's computers. Creates and edits the clinic's own studies and protocols (if `can_create_projects`). Receives studies from researchers, read-only. |
| **Researcher** | N | Owns multi-site studies and their protocols. Attaches studies to their clinics. Reviews recordings across their clinics. |
| **Master** | all | Everything above, plus creating clinics, assigning clinics to users, granting the `can_create_*` flags, and handling unassigned computers. |

Clinician and researcher are **the same role**. They differ only in the number of assigned clinics, so the UI never branches on "clinician vs researcher". It branches only on:
- `isMaster`;
- the number of clinics (1 vs more);
- per study, `canEdit`.

## 3. Domain model and glossary

| UI term (EN / CS / DE) | Code / DB | Meaning |
|---|---|---|
| **Study** / Studie / Studie | `project` | *What* is collected. Owns its protocols. Has editors. |
| **Protocol** / Protokol / Protokoll | `protocol` (group, version, language rows) | An ordered recipe of tasks. Belongs to exactly one study. Library entries are the exception: they belong to none (`project_id` NULL). Language variants are one protocol shown with language chips. |
| **Clinic** / Klinika / Klinik | `site` | *Where* it runs. One access token, settings for the desktop app, its computers and its recordings. |
| **Computer** / Počítač / Computer | `device` | One installation of the desktop app. It belongs to the clinic whose token it uses, and every computer of a clinic receives the same config. |
| **Recording** / Záznam / Aufnahme | `upload_session` | One examination uploaded from a computer. It belongs to a clinic, a study and a protocol. |
| **Runs at** / Běží na / Läuft an | `site_projects` | The link between a study and a clinic. It decides what the clinic's computers download. |
| **Editor** / Editor / Bearbeiter | `project_editors` (new) | A user who may change a study and its protocols. |
| **Protocol library** / Knihovna protokolů / Protokollbibliothek | `protocols` with `project_id IS NULL` | Ready-made protocols that anyone who writes protocols can add to a study. An entry belongs to no study and never reaches a computer. |
| **File-name form** / Tvar pro názvy souborů / Form für Dateinamen | none (computed) | The clinic name as the desktop app writes it into file names: accents stripped, everything outside `[A-Za-z0-9_-]` removed. |

**Relations:**
- Study 1—N Protocol.
- Study N—M Clinic, through "runs at".
- Clinic 1—N Computer.
- Clinic 1—N Recording, and each Recording references a Study and a Protocol.
- Library entry 1—N Protocol, through `copied_from_id`. Adding an entry to a study **always copies it**. The copy is an ordinary protocol of that study, and later changes to the entry never touch it.

**What a clinic's computers receive** = the current, non-archived protocols of every active study that runs at the clinic. This is computed and never stored. The view `v_site_protocols` is kept.

## 4. Access model

```
clinics I see        = user_sites                          (master: all)
studies I see        = studies running at my clinics ∪ studies I edit   (master: all)
studies I edit       = project_editors                     (master: all)
recordings I see     = recordings whose clinic I see       (strict; editing a study does not widen it)
recordings I review  = same as I see (QC, comments, participant edit)
computers I see      = computers of clinics I see; unassigned/quarantined: master only
```

| Action | Who |
|---|---|
| Create a study | master, or a user with `can_create_projects`. The creator becomes its first editor. |
| Edit a study or its protocols, archive a protocol | editors of that study, and master |
| Archive or restore a study | its creator, and master (unchanged) |
| Add or remove co-editors | editors of that study, and master. Users are found **by exact email**. The creator and the last editor can't be removed. |
| Toggle "runs at" for a study and clinic | master, or an editor of the study who **also sees that clinic** |
| Create a clinic | master, or a user with `can_create_sites`. The creator is assigned to it automatically. |
| Edit a clinic (name, contacts, desktop settings) | master, or the clinic's creator (unchanged) |
| Show or rotate the access token | master only (unchanged: the token is returned only to master) |
| Assign clinics to users, set the `can_create_*` flags, create users | master only |
| Rename a computer, or assign an unassigned computer to a clinic | master only (unchanged) |
| Browse the protocol library, and add an entry to a study | anyone who may write protocols: master, users with `can_create_projects`, and editors of at least one study. Adding needs edit rights on the target study. |
| Share a protocol to the library | editors of the protocol's study, and master |
| Edit, update or withdraw a library entry | its author (`created_by`), and master |

- **Owned vs received.** A study I can edit is *owned*. A study I see only through a clinic is *received*. It shows a lock badge with the line "Managed by {creator name}. You can review its recordings." Every edit control is **absent**: not disabled, not hidden behind an error.
- **Removed concepts:**
  - read-only project grants (`user_projects` without `can_edit`);
  - per-project clinic narrowing (`user_project_sites`).

## 5. Information architecture

```
┌ Sidebar ─────────────┐
│  ● Product name      │
│  Recordings      (n) │  n = unreviewed in scope
│  Studies             │
│  Clinics  (or "My clinic" when exactly one)
│  Library             │  only for users who may write protocols
│  ──────────          │
│  Users        master │
│                      │
│  [user menu ▾]       │  name · role chip · language · log out
└──────────────────────┘
```

### Routes (HashRouter is kept)

| Route | Screen |
|---|---|
| `#/login`, `#/reset-password/:token`, `#/setup-account` | auth (no shell) |
| `#/recordings` | **Home.** The recordings inbox. |
| `#/recordings/:sessionId` | recording detail |
| `#/studies` | studies list |
| `#/studies/:id` → `#/studies/:id/protocols` | study (the default tab is Protocols) |
| `#/studies/:id/{protocols,clinics,recordings,editors,settings}` | study tabs |
| `#/studies/:id/protocols/:protocolId` | protocol editor (full width, shell collapsed) |
| `#/studies/:id/protocols/:protocolId/preview` | participant preview (no shell) |
| `#/clinics` | clinics list. With exactly one clinic it redirects to that clinic. |
| `#/clinics/:id` → `#/clinics/:id/studies` | clinic (the default tab is Studies) |
| `#/clinics/:id/{studies,computers,recordings,settings}` | clinic tabs |
| `#/library` | protocol library |
| `#/library/:protocolId` | library entry: a preview of its tasks and settings, and "Add to study" |
| `#/library/:protocolId/edit` | the protocol editor on a library entry (author and master) |
| `#/users`, `#/users/:id` | master only. A non-master gets a "Not available" page inside the shell, not a silent redirect. |
| `*` | 404 inside the shell, with a link to Recordings |

**Redirects from old routes** (kept for one release, covered by an e2e test):

| Old route | New route |
|---|---|
| `/admin` | `/recordings` |
| `/admin/uploads` | `/recordings` |
| `/admin/uploads/:id` | `/recordings/:id` |
| `/admin/uploads/devices` | `/clinics` |
| `/admin/uploads/downloads` | `/recordings` |
| `/admin/projects/:id` | `/studies/:id` |
| `/admin/projects/:id/protocols` | `/studies/:id/protocols` |
| `/admin/projects/:id/protocols/:pid` | `/studies/:id/protocols/:pid` |
| `/admin/sites/:id` | `/clinics/:id` |
| `/admin/project-management` | `/studies` |
| `/admin/site-management` | `/clinics` |
| `/admin/admin-management` | `/users` |
| `/participant/test` | `/recordings` |

Old query parameters `?site=` and `?project=` map to `?clinic=` and `?study=`.

## 6. Screens

**Shared rules:**
- Every page has a `PageHeader` with breadcrumbs (detail pages only), a title, an optional status badge and **at most one primary button**. Secondary actions are quiet buttons or sit in a "⋯" menu.
- Lists are `DataTable`s with clickable rows and no per-row button rows.

### 6.1 Recordings (home)

**Intent:** "What came in, and what needs me?"

- **Header:** the title "Recordings". The primary action is **Download** (a bulk ZIP of the selection or the current filter). It replaces the Downloads page. Export CSV sits in "⋯".
- **KPI strip** (reuse `UploadsPage` cards): Unreviewed, Needs attention, Invalid, Received (7 days). Clicking a card applies its filter.
- **Filters** (one row): search, Clinic (hidden when the user has one clinic), Study, Protocol, Review, Server check, Date range. Flag chips sit under "More filters".
- **Table columns:** Received (relative time, absolute on hover), Patient · visit, Study / Protocol, Clinic (hidden with one clinic), Length, Tasks, Server check (dot plus reason), Review (dot), Flags (at most 2 plus "+n").
- The default sort is unreviewed first, then newest.
- Row selection uses checkboxes for bulk download.
- **Banner (master only):** "n computers are not assigned to a clinic, and their recordings are in quarantine". It links to Clinics › Unassigned computers.
- **Empty state:** "No recordings yet. They appear here when a clinic computer uploads its first session."

### 6.2 Recording detail

Keep the current `SessionDetailPage` structure (the audit's §D), restyled. Changes:
- The breadcrumb is Recordings › {patient code}. Previous and next follow the list's filter. The primary action is Download ZIP. On a quarantined recording it is "Assign computer…" (master), and Download moves into "⋯".
- **Quarantined recordings** get an amber header strip: "Quarantined: this computer isn't assigned to a clinic". The master sees "Assign computer…" (F-043).
- Missing technical values are hidden instead of rendered as "undefined" (F-035). Dates are formatted correctly ("recorded on 13 Oct 2026").
- Camera warnings show a readable sentence, with the raw text behind "Details" (F-036 web side).
- Questionnaire answers show question and answer text from the session's protocol snapshot. Internal keys are shown only when the text is missing (F-040).
- Clips that can't play in the browser show "This clip can't play in the browser. Download to play." instead of a broken player (F-037 fallback).
- **New Activity section** (collapsed): reveals, participant edits, QC changes and comments, from `audit_log` (F-044).

### 6.3 Studies list

**Intent:** "My studies, and the ones I take part in."

- **Header:** the title "Studies". The primary action **New study** appears only with `can_create_projects` or master.
- **Two groups:** *Yours* (editable) and *Received* (lock badge). For a master there is one group, "All studies".
- **Table columns:** Name, Protocols (number of groups, with language chips summarised), Runs at (clinic names, or "n clinics"), Recordings (30 days), Unreviewed, Status (Active / Archived dot).
- A filter for archived studies is off by default.
- **New study modal:** Name (required), Description, Countries, Contacts. The study is created, and the app then opens Study › Protocols, whose empty state has "Create first protocol".

### 6.4 Study

- **Header:**
  - breadcrumb Studies › {name};
  - status badge;
  - Owned/Received badge;
  - a "Shared with n clinics" chip when n > 1.
  - The primary action depends on the tab: **New protocol** on Protocols, **Add editor** on Editors, and none on the others.
  - "⋯" holds Archive or Restore (for the creator and master).
- **Tabs:**
  - **Protocols** (the default):
    - One row per protocol *group*: Name, Languages (chips), Version, Tasks, Last changed.
    - Clicking a row opens the editor.
    - The row "⋯" menu holds:
      - Preview;
      - Duplicate (within this study, or to another study I edit);
      - **Share to library**, or **Update library entry** when I shared this protocol before;
      - Archive.
    - A protocol copied from the library shows "From library: {entry} v{n}" under its name. The link goes to the entry. It is information only, not a sync.
    - Archived protocols sit in a collapsed "Archived (n)" section. Protocols of other studies **never** appear here (A6).
    - Received studies show the same table read-only, and the editor opens in view mode.
  - **Clinics:**
    - All clinics the study runs at, with recordings and last upload per clinic.
    - An editor also sees the clinics they could add (their visible clinics), each with a "Runs here" switch. Turning a switch off needs a confirmation: "The computers at {clinic} will stop receiving this study's protocols on their next refresh."
  - **Recordings:** the Recordings table, pre-filtered to this study (same component).
  - **Editors:**
    - A list of editors (name, email, "Creator" tag).
    - "Add editor" asks for an email. If no user matches, the message is "No user with this email."
    - Remove is available for anyone except the creator and the last editor.
  - **Settings:** name, description, countries, contacts, active. It is a form inside the page, not a modal, with Save as the page's primary action while the form has changes. Read-only for a received study.
- **New protocol modal.** A segmented control at the top offers **Blank** (the default) and **From library**.
  - **Blank:** Name (required), Language (required, the default being the user's UI language), Description. Defaults follow F-006:
    - a required `patient_code` identifier;
    - the file-name template `${patientCode}_${taskIndex}_${task.subtype}_Rep${repetition}`.
  - **From library:** a search field and a list of entries (name, languages, tasks, author). Picking one shows its task list. The name defaults to the entry's name and can be changed.
    - The primary button **Add to study** copies the entry, stays on the Protocols tab and shows a toast.
    - The secondary button **Add and edit** copies the entry and opens the editor on the copy.
  - Either way, the modal returns or opens the **new id** (F-058).
  - A name already used in this study is rejected inline: "This study already has a protocol with this name." Uploads are matched by study name plus protocol name, so names must stay unique within a study.

### 6.5 Protocol editor

The functionality stays as it is. The layout changes to a workspace:
- **Header:**
  - breadcrumb Studies › {study} › {protocol};
  - language chips (switch the variant; "+" adds one);
  - a version tag;
  - **Save** as the only primary action, enabled only when the protocol is dirty;
  - "Preview" as a quiet button.
  - The warning "Saving creates version n+1" appears only once the protocol is dirty.
- **Body:** a two-column layout.
  - **Left column:** the task catalogue, with search. The UI calls it "Tasks", so it isn't confused with the protocol library. Boolean defaults show as Yes/No (F-007).
  - **Right column:** the protocol's task list at full height, reordered by drag (the separate "Reorder Tasks" mode goes away if the existing reorder component allows; otherwise the reorder action stays in "⋯").
- **Collapsible panel "Protocol settings":**
  - identifiers;
  - the file-name template with a live example;
  - the manual PDF URL;
  - Info page and Instructions.
- **Library entries** open in the same editor, at `#/library/:id/edit`.
  - The breadcrumb is Library › {entry}.
  - The settings panel says: "Used in n studies. Saving creates a new library version. Those studies keep their copies."
- **Leaving:** leaving with unsaved changes asks for confirmation. Without changes, no confirmation appears (fixes the current always-on confirm).
- **Read-only mode:** received studies, or a protocol viewed from an archived study. There is no Save, the task catalogue is hidden, and the banner reads "Read-only: managed by {creator}".

### 6.6 Clinics list

**Intent:** "Where my studies run."

- **One clinic:** the route redirects to the clinic itself, and the sidebar label is "My clinic".
- **Header:** the title "Clinics". The primary action **New clinic** appears for master or with `can_create_sites`.
- **Table columns:** Name, Country, Studies running, Computers (count, with a warning dot if any is silent or failing), Last upload, Unreviewed.
- **Master only:** an "Unassigned computers (n)" section above the table. It lists quarantined installations with "Assign to clinic…". This replaces the top-level Devices page.

### 6.7 Clinic

- **Header:**
  - breadcrumb Clinics › {name} (omitted for a one-clinic user, where the title alone is shown);
  - status badge.
  - The primary action depends on the tab: none on Studies for non-editors; **Add study** for users who can edit any study.
- **Tabs:**
  - **Studies** (the default):
    - A section **"What the computers receive"**: a list grouped by study, showing each protocol once with language chips and its version (F-014). This answers A5.
    - The studies running here, each with an Owned/Received badge.
    - An editor of a study can remove it from this clinic (with confirmation), or add one of their studies here.
  - **Computers:**
    - **Connection** card:
      - Master sees the server URL and the access token, masked with "Show" and "Copy". The rotate action carries a warning: "Every computer using the old token stops receiving updates."
      - Non-master sees the line "Ask your administrator for the access token."
    - **Computers** table: Name (rename for master), App version, Last seen (relative), Status (Healthy / Waiting / Silent / Failing / **Needs assignment**), Pending uploads.
    - Rejected uploads are not counted as uploads (F-045).
  - **Recordings:** the Recordings table, pre-filtered to this clinic.
  - **Settings:** identity (name, description, country, contacts) and **Desktop app settings**.
    - The desktop app settings use human labels and options: "Default language: English", and an indicator style "Circle / Bar / None" instead of "CIRCLE".
    - Real placeholders say "e.g. USB audio CODEC" in grey, with no fake values.
    - The tab is editable by master and the creator, and read-only otherwise.
    - **F-008, decided: any name.**
      - The clinic name is free text of 1–64 characters, and spaces and accents are allowed. `isValidSiteName` changes to that rule, in the backend and in the form.
      - The name reaches the desktop app **unchanged**, as `siteName`, exactly as today. The desktop app already sanitises it for file names (`PatientFieldCatalogue.sanitize`: strip accents, remove everything outside `[A-Za-z0-9_-]`). The server never puts the clinic name into a file name; it only appears in CSV exports.
      - The New clinic modal and Settings show that sanitised form live under the field: "In file names: `OlomoucUniversityHospital`". `src/utils/fileNameForm.js` mirrors the desktop rule, with a unit test using the desktop app's own test cases.
      - Renaming a clinic changes the file names of later recordings only. Settings says so under the field.

### 6.8 Users (master)

- **Header:** the title "Users". The primary action is **New user**.
- **Table columns:** Name, Email, Clinics (chips, or "All" for master), Can create (Studies / Clinics icons with labels), Status (Active / Disabled), Last login (if available).
- **User page** `#/users/:id`, with sections:
  - Profile (name, email, active, resend reset);
  - **Clinics** (a checklist of all clinics, with search);
  - **Permissions** (two switches: may create studies, may create clinics);
  - **Studies they edit** (read-only list, with links).

  All icon buttons get labels.

### 6.9 Auth pages

- The login page carries the product name and a one-line purpose ("Set up studies and review recordings from clinic computers").
- Its fields have proper labels.
- The reset and setup-account pages use the same card.

### 6.10 Protocol library

**Intent:** "Start from something that works."

- **Who:** the sidebar item and the routes exist only for users who may write protocols (§4). Others get the "Not available" page.
- **Header:** the title "Library". There is no primary action. Entries are created only by sharing a protocol from a study, so there is one way in.
- **Filters:** search, Language, and a "Shared by me" chip.
- **Table columns:** Name (with the description as a sub-line), Languages (chips), Tasks, Length (an estimate), Author, Used in (n studies), Last changed.
- **Entry page** `#/library/:id`:
  - the breadcrumb Library › {name}, a version tag and an author line;
  - a read-only task list with a summary of the protocol settings: identifiers, file-name template, languages;
  - the primary action **Add to study…** opens a modal. It asks for one of my studies and the name (prefilled), and offers "Open in the editor after adding";
  - a quiet **Preview** button opens the participant preview;
  - for the author and master, "⋯" holds **Edit** and **Withdraw from library**. Withdrawing hides the entry for everyone, and copies in studies stay as they are.
- **Empty state:** "No protocols shared yet. Share one from a study's Protocols tab with ⋯ › Share to library."

## 7. Desktop contract (frozen)

These must not change in any observable way:
- `GET /site-config/:token`
- `POST /device-checkin`
- `POST /upload`
- the config JSON (`utils/extConfig.js`), including `project` on each protocol, field names, ordering semantics and the `strings` field
- the upload ZIP format

**Guard:** before any backend change, capture golden responses of `/site-config/:token` for every seeded clinic into `backend/test/fixtures/site-config.golden/*.json`, and add a test that compares them (deep-equal, with the timestamp and `configVersion` fields normalised). The test must pass after every increment.

The F-006 defaults (§6.4) change only the *values* of a newly created protocol, never the shape. F-009 and F-010 stay out of scope.

- **Library entries** have no study, so they never appear in `v_site_protocols` or in any config. A copy in a study is an ordinary protocol.
- **`siteName`** is unchanged: it is still `sites.name`. F-008 changes only which names the web form accepts.
- **Protocol names are unique only within a study, no longer globally.** Two studies at one clinic may both send "Speech battery".
  - Upload matching uses study name plus protocol name (`sessionExtractor.js`), so it stays unambiguous.
  - The name-only fallback, used when a ZIP carries no `protocolProject`, is there only for old desktop clients.
  - B1 adds a unit test: with two protocols of the same name in one config, a ZIP that carries `protocolProject` matches the right one.

## 8. Backend changes

**No data migration** (the user's decision, 2026-10-25). Every database, including the test server's, is recreated from `create_tables.sql` and the seeds with `runInit.js`. The existing data is thrown away.
- `alter_permissions.sql`, `applyPermissions.js` and the `db:permissions` script are deleted, and their content folds into `create_tables.sql`.
- No `alter_*` script is written for this redesign.

### 8.1 Schema

1. **`project_editors`**:
   - columns `(id, user_id FK, project_id FK, created_at)`, with a unique key on `(user_id, project_id)`;
2. **`protocols.project_id`**:
   - an INT FK to `projects`, indexed (NULL only for library entries, see item 5);
   - `project_protocols` is removed.
3. **Drop `user_project_sites`.**
4. **Views in `create_views.sql`:** every view that reads the removed tables is rewritten onto `protocols.project_id` and `project_editors`. That covers:
   - `v_site_protocols`, which feeds the config and upload matching (`src/upload/siteContext.js`);
   - `v_project_protocols`;
   - the second `project_protocols` join, around line 180;
   - `v_user_project_assignments`, which reads `user_projects`.

   **Checks:** `v_site_protocols` must produce identical rows. The golden test and the upload-ingest e2e test both check this.

   **Library entries** (`project_id` NULL):
   - They drop out of all these views naturally.
   - `GET /protocols/:id` on a library entry follows the library access rule (§4), not the study rule.
   - Study protocol lists never include NULL-project rows.
5. **Library columns on `protocols`:**
   - `project_id` is **NULL for a library entry** and NOT NULL otherwise. The controller enforces this, and so does a CHECK where MariaDB allows it.
   - A copy (library → study, study → library, or Duplicate) always gets a **new `protocol_group_id`** and starts at version 1. That's why `protocols_index_1 (protocol_group_id, version, language_id)` never collides.
   - `copied_from_id` is a nullable INT, an FK to `protocols.id` ON DELETE SET NULL.
     - On a study copy, it points at the library version the copy came from.
     - On a library entry, it points at the study protocol it was shared from. That is how "Update library entry" finds the entry.
   - The unique index `protocols_index_2 (name, version, language_id)` becomes `(project_id, name, version, language_id)`, so a copy can keep its name. Names stay unique within a study, and the controller checks that library names are unique.
6. **`sites`:** no schema change for F-008. `sites.name` stays varchar(255).
7. **Library seed:**
   - `e2e_seed.sql` and `artificial_data.sql` share two existing protocols to the library: the speech battery and one video protocol.
8. **Kept:** `users.can_create_projects`, `users.can_create_sites`, `sites.created_by` and `projects.created_by`.

### 8.2 Access (`src/utils/accessScope.js`)

The module shrinks to these functions:
- `getEditableProjectIds`
- `getVisibleSiteIds`
- `getVisibleProjectIds`
- `canCreateProjects` / `canCreateSites`
- `ownsRecord`
- `getVisibleScope`

The rules are the ones in §4. The whitelist SQL is removed. The upload scoping (`scopeWhereClause`, `canSeeSession`, `canEditSession`) consumes `getVisibleSiteIds` **only**. A study grant must no longer widen recordings visibility, so this changes from today's behaviour. Update `test/integration/sessionScope.test.js` to match.

### 8.3 Admin API (RESTful; the desktop routes are untouched)

| Resource | Endpoints |
|---|---|
| Projects | `GET /projects` (each with `can_edit`, `is_owner`, `site_count`, `protocol_count`, `unreviewed`) · `POST /projects` · `GET /projects/:id` · `PATCH /projects/:id` · `POST /projects/:id/archive` `{archived}` |
| Project editors | `GET /projects/:id/editors` · `POST /projects/:id/editors` `{email}` · `DELETE /projects/:id/editors/:userId` |
| Runs at | `PUT /projects/:id/sites/:siteId` · `DELETE /projects/:id/sites/:siteId` (the site side uses the same endpoints) |
| Protocols | `GET /projects/:id/protocols?archived=0\|1` (grouped: one item per group, with `languages[]`) · `POST /protocols` (create, and save a new version) · `GET /protocols/:id` · `POST /protocols/:id/archive` |
| Sites | `GET /sites` · `POST /sites` · `GET /sites/:id` (incl. `receives[]` = grouped protocols, `projects[]` with `can_edit`) · `PATCH /sites/:id` (`access_token` is accepted from master only, which is how "rotate" works) |
| Users (master) | `GET /users` · `POST /users` · `GET /users/:id` · `PATCH /users/:id` (`name`, `email`, `is_active`, `can_create_projects`, `can_create_sites`) · `PUT /users/:id/sites` `{site_ids:[]}` (replaces the set) |
| Library | `GET /library?q=&lang=&mine=1` (current, non-withdrawn entries, grouped like protocols, with `used_in`) · `GET /library/:id` · `POST /protocols/:id/share` (copies the current version of a study protocol's group into the library, or adds a new library version when it was shared before) · `POST /library/:id/copy` `{project_id, name}` → `{protocol_id}` · `POST /library/:id/withdraw`. Library entries are edited through the normal `POST /protocols` save. When `project_id` is NULL, that save checks for the author or master. |
| Uploads | unchanged paths, plus `GET /uploads/:sid/activity` (audit entries for that session, scoped like `getUpload`) · `GET /uploads/summary` gains `unassigned_devices` for master |
| Devices | unchanged |
| Lookups | `GET /mappings` unchanged |

**Errors:**
- `400 {error: "<snake_case>"}` for validation;
- `403` for actions on a visible but non-editable record;
- `404` for records out of scope (never 403, so their existence isn't leaked).

The old route paths are removed. They aren't used by the desktop app.

## 9. Frontend architecture

- **Styling:**
  - `src/styles/tokens.css` is the single `:root`. Feature CSS files may only use tokens.
  - **Tokens:** neutral greys (grey-0 to grey-900), one accent (blue `#2f6fed` or close to it), status colours (green, amber, red, grey), a radius scale (6 / 10 / 14), a spacing scale (a 4-px base), a type scale (12 / 14 / 16 / 20 / 28) and the system font stack.
  - Body text is 14 px.
- **UI kit** in `src/components/ui/`:
  - Layout and navigation: `AppShell`, `Sidebar`, `PageHeader`, `Breadcrumbs`, `Tabs`, `Section`.
  - Data display: `DataTable`, `Badge`, `StatusDot`, `EmptyState`, `KeyValue`.
  - Actions and inputs: `Button`, `IconButton` (always with an `aria-label` and a tooltip), `Menu` (⋯), `Switch`, `TextField`, `Select`, `CopyField`.
  - Overlays and feedback: `Modal`, `ConfirmDialog` (the existing provider, restyled), `Toast` (with a `useToast` provider).
  - Icons: inline SVGs in one `icons.jsx`, about 20 icons. No new dependency.
- **API layer:** one module per resource in `src/api/` (`projects.js`, `protocols.js`, `library.js`, `sites.js`, `users.js`, `uploads.js`, `devices.js`), built on `apiClient.js`. Pages never call `fetch` or build URLs.
- **Dates:** one `src/utils/formatDate.js` with relative, short date and date-time helpers. It follows the UI locale, through `Intl`.
- **i18n:**
  - New keys live in the namespaces `nav`, `studies`, `clinics`, `library`, `users` and `common`, plus the existing `uploads`, `uploadTools` and `tasks`.
  - en, cs and de must all be complete.
  - A vitest parity test fails on any key that is missing in cs or de.
- **Kept:** the contexts, `apiClient.js`, the uploads cards and components (restyled), the protocol editor internals, and `ParticipantInterfacePage`.
- **Deleted:**
  - `ProjectFieldworkPage`, `components/Fieldwork/*`, `VideoRecorderTest.jsx` and `main_video_test.jsx`;
  - the management pages and the dashboard grids, `MasterTools` and `MyTools`;
  - `DownloadsPage` (its logic moves to the Recordings bulk download);
  - the `alert()` calls.
- **Test IDs:** keep the existing `data-testid` values where the concept survives. New ones follow the pattern `<area>-<thing>`, for example `nav-recordings`, `study-tab-protocols` and `clinic-receives`.

## 10. Acceptance criteria

Each criterion is checked by a test or a grep, as noted.

1. **Navigation.**
   - Every route except auth, preview and the protocol editor renders `AppShell` with the sidebar. The editor uses a collapsed shell.
   - Covered by an e2e test that visits each route and asserts the `nav-*` elements.
2. **Redirects.** Every old route in §5 redirects as specified (e2e).
3. **Single primary action.** Every page has at most one element with `.btn-primary` / `variant="primary"` (e2e assertion per route).
4. **Received studies.**
   - As a user who sees a study only through a clinic, the study shows the lock badge, and no Save, New protocol, Archive or Settings-save control exists.
   - `POST /protocols`, `PATCH /projects/:id` and `POST /protocols/:id/archive` return 403 (e2e plus unit).
5. **One clinic.** A one-clinic user who opens `#/clinics` lands on `#/clinics/:id`. The Clinic filter and Clinic column are absent in Recordings (e2e).
6. **Runs at.**
   - An editor can toggle a study on and off at a clinic they see, from both the study side and the clinic side.
   - A non-editor gets 403.
   - An editor who doesn't see the clinic gets 404.
   - The change is reflected in `/site-config/:token` (e2e plus unit).
7. **Editors.**
   - Add by email works.
   - An unknown email returns 404 `user_not_found`.
   - Removing the creator returns 400 `cannot_remove_creator`.
   - Removing the last editor returns 400 `last_editor`.
   - A non-editor gets 403 (unit plus e2e).
8. **Strict recordings scope.** A user who edits a study but isn't assigned clinic X can't list, open or download X's recordings of that study (integration test).
9. **Desktop contract.**
   - The golden `/site-config` test passes.
   - The `uploads-ingest.spec.ts` e2e spec passes **unmodified** (shown by git diff).
   - In `site-config.spec.ts`, only the two setup calls to the removed admin route `PUT /projects/update` (lines 70 and 83) change, to `PATCH /projects/:id`. Every `/site-config` request and every assertion stays byte-identical (shown by git diff).
10. **Schema.**
    - `user_project_sites`, `user_projects` and `project_protocols` are absent after `runInit`.
    - `db:schema:diff .env .env.test` is clean.
11. **Styling.**
    - `grep -r ":root" src --include=*.css` finds 1 file.
    - `grep -rn "alert(" src` finds 0 hits.
    - There are no emoji icons in `src/pages` or `src/components` (grep for the emoji range).
    - `style={{` appears ≤ 5 times in `src/pages`.
12. **i18n.**
    - The parity test passes.
    - The en JSON contains no user-facing "Site", "Project", "Upload session" or "Device" strings (grep, with an allow-list for technical labels).
13. **Findings.** Each finding has the check named for it in the plan's findings table. A screenshot counts only where the table names one. F-011 and F-012 have text fixes. F-037 has its fallback.
14. **Green.**
    - Frontend `npm run build`, `npm test` and `npm run test:e2e` pass.
    - Backend `npm test` passes.
15. **Screenshots.** The "after" set in `screens/after/` uses the same personas and the capture script, and is updated for the new routes.
16. **Protocol library.**
    - **Copy, edit, entry unchanged.** An editor shares a protocol. A second user with `can_create_projects` sees it, adds it to their study and edits the copy. The library entry is unchanged.
    - **Update, copy unchanged.** The author updates the entry. The earlier copy is unchanged and still shows its original version.
    - **No access.** A clinician with only received studies gets 403 on `GET /library` and has no Library item.
    - **Withdraw.** Withdrawing hides the entry from the list but leaves the copies.
    - **Name taken.** Adding with a name already taken in the study returns 400 `name_taken`.
    - **Never in config.** A library entry never appears in any `/site-config` output (unit plus e2e).
17. **F-008.**
    - Creating "Olomouc University Hospital" succeeds, and `/site-config` returns that name unchanged as `siteName`.
    - `fileNameForm("Fakultní nemocnice Brno")` returns `FakultninemocniceBrno`, matching the desktop app's sanitiser on its own test cases.
    - Names longer than 64 characters, or empty, are rejected with 400.
    - Covered by unit tests.
18. **Dependencies.**
    - `npm outdated` in `frontend/` and `backend/` lists nothing, apart from holds the user approved. Each hold is recorded with its reason in `dependency_upgrade.md`.
    - `npm audit` reports no high or critical findings.
    - `engines.node`, `.nvmrc` and CI use the same Node line.
