# UI "before" screenshots (branch newshare)

Captured by `frontend/e2e/tools/capture.spec.ts` (run `npx playwright test -c playwright.capture.config.ts` from `frontend/`). 1440px wide, full-page, English, seeded E2E data (all passwords 1234).

Personas: master@test.com (master), clinic@test.com (site grant E2E Clinic A), editor@test.com (project Speech Study, can edit, narrowed to E2E Clinic B), reviewer@test.com (Speech Study read-only). nogrant@test.com was not captured.

Notes: master protocol screens use project "Test Study 001" (seeded protocol with tasks); other personas use "Speech Study" (protocol with 0 tasks). Site/project detail for non-master personas is E2E Clinic A / Speech Study.

## master

| File | Route | What is on screen |
|---|---|---|
| 01-login.png | `#/login` | Login page, empty. Bare form top-aligned, no logo/branding, password field has no placeholder and a grey "Show" button beside it; "Editor language" selector floats top-right; rest of the page is empty. |
| 02-dashboard-home.png | `#/admin` | Admin dashboard: Monitoring cards (Uploads, Devices), "Your Assigned Sites" and "Your Assigned Projects" card grids with status and upload badges. Subtitle typo ("Selects sites to assign projects..."); heading says "Assigned" even for master who sees everything; master tool tiles at the bottom. |
| 03-user-management.png | `#/admin/admin-management` | User management (master). Three stacked tables (System Administrators, Project Assignments, Site Assignments) with icon-only action buttons (pen, plus, building, no-entry) without labels; the administrators table is clipped inside its own scroll area (last row cut off), i.e. nested scrolling. |
| 04-user-management-modal-create.png | `#/admin/admin-management` | "Add administrator" modal: email, name, project and site checkbox lists, two permission checkboxes, button "Save Changes" for a create action; label/input alignment uneven; "Your Assigned Projects" wording. |
| 05-user-management-modal-edit.png | `#/admin/admin-management` | Edit administrator modal (pen icon). |
| 06-user-management-modal-assign-project.png | `#/admin/admin-management` | Modal from the second (plus) icon: assign project to user. |
| 07-user-management-modal-assign-site.png | `#/admin/admin-management` | Modal from the third (building) icon: assign site to user. |
| 08-project-management.png | `#/admin/project-management` | Project management (master): one table of projects (ID, name, dates, status under a column called "Label", countries, contacts) with edit/archive icon buttons; large empty area below. |
| 09-project-management-modal-create.png | `#/admin/project-management` | Create project modal. |
| 10-project-management-modal-edit.png | `#/admin/project-management` | Edit project modal (pen icon). |
| 11-site-management.png | `#/admin/site-management` | Site management (master): table of sites; truncated access token with a copy button wrapping underneath; action icon cells misaligned with row separators; Country empty for several sites. |
| 12-site-management-modal-create.png | `#/admin/site-management` | Create site modal. |
| 13-site-management-modal-edit.png | `#/admin/site-management` | Edit site modal: long form with access token (warning text), Desktop app settings group; placeholders that look like values ("63", "USB audio CODEC"), raw codes ("en", "CIRCLE") in dropdowns. |
| 14-site-detail.png | `#/admin/sites/4` | Site detail: header metadata (description, country, contacts, access token), statistics strip, uploads table with per-day chart and devices, assigned projects table. |
| 15-site-detail-modal-edit.png | `#/admin/sites/4` | Edit site modal opened from the site detail page. |
| 16-site-detail-modal-manage-projects.png | `#/admin/sites/4` | "Manage Projects" modal: assigned list with "Remove Assignment" button crammed against the project name, available projects with Assign buttons. |
| 17-project-detail.png | `#/admin/projects/1` | Project detail: header metadata, statistics strip, Quick Actions (single Protocols card), uploads table and chart, sites table. |
| 18-project-detail-modal-edit.png | `#/admin/projects/1` | Edit project metadata modal (full-page capture: dim overlay only covers the first 900px). |
| 19-protocol-list.png | `#/admin/projects/1/protocols` | Protocols Management: create form (name, description, Create button), Current Protocols table, "Archived / Other Protocols" table that also lists other projects' protocols. |
| 20-protocol-create-form-filled.png | `#/admin/projects/1/protocols` | Create-protocol form with a name typed; Create button turns green. |
| 21-protocol-create-editor-new.png | `#/admin/projects/1/protocols/undefined` | Protocol Task Editor for a brand-new protocol (after "+ Create Protocol"): task library left, current protocol right, red "At least one task must be added" box, disabled Show/Save buttons. |
| 22-protocol-editor-existing.png | `#/admin/projects/1/protocols/1` | Protocol Task Editor on an existing protocol: task library, language variants, task cards inside a small scroll box, "Show designed protocol" / "Save protocol". |
| 23-participant-preview-from-editor.png | `#/participant/test` | Participant preview reached from the editor ("Show designed protocol"): starts on the Audio Guide intro screen with Back/Skip/Next. |
| 24-participant-preview.png | `#/participant/test` | Participant preview reached from the protocol list "Show": Audio Guide intro screen with Back/Skip/Next. |
| 25-uploads-list.png | `#/admin/uploads` | Uploads list: KPI cards, filter bar (search, project, protocol, date, flag chips), sessions table with server-check and review badges. Different header style from other admin pages. |
| 26-upload-session-detail.png | `#/admin/uploads/e2e0a200000000000000000000000000` | Upload session detail: session facts grid, Review/comment panel, collapsed Server checks, Participant panel with masked values, recording timeline, tasks table, Upload history. |
| 27-devices.png | `#/admin/uploads/devices` | Devices page: health KPIs and a device table with quarantine / assign controls. |
| 28-downloads.png | `#/admin/uploads/downloads` | Downloads: pick Site/Project, filters, tick sessions, Download button (disabled until a selection). |
| 29-404.png | `#/admin/does-not-exist` | 404 page "Page not found": centered card with a Back button; no top bar, no link to the dashboard or login. |

## clinic

| File | Route | What is on screen |
|---|---|---|
| 01-login.png | `#/login` | Login page, empty. Bare form top-aligned, no logo/branding, password field has no placeholder and a grey "Show" button beside it; "Editor language" selector floats top-right; rest of the page is empty. |
| 02-dashboard-home.png | `#/admin` | Admin dashboard: Monitoring cards (Uploads, Devices), "Your Assigned Sites" and "Your Assigned Projects" card grids with status and upload badges. Subtitle typo ("Selects sites to assign projects..."); heading says "Assigned" even for master who sees everything; master tool tiles at the bottom. |
| 03-user-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 04-project-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 05-site-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 06-site-detail.png | `#/admin/sites/4` | Site detail without Edit / Manage Projects (read-only): access token, country and contacts shown as a bare dash with no explanation. |
| 07-project-detail.png | `#/admin/projects/3` | Project detail read-only: "Mode read-only" warning next to the ACTIVE badge, grey disabled Edit; sites table cell "Last upload" concatenates "1 min ago25. 10. 2026 02:55". |
| 08-protocol-list.png | `#/admin/projects/3/protocols` | Protocols page read-only: banner "Inactive / Archived: Mode read-only" shown although the project is ACTIVE (misleading); create form and Edit/Duplicate/Archive greyed out; only Show works. |
| 09-participant-preview.png | `#/participant/test` | Participant preview of a protocol with 0 tasks: only the generic Audio Guide intro screen. |
| 10-uploads-list.png | `#/admin/uploads` | Uploads list: KPI cards, filter bar (search, project, protocol, date, flag chips), sessions table with server-check and review badges. Different header style from other admin pages. |
| 11-upload-session-detail.png | `#/admin/uploads/e2e00300000000000000000000000000` | Upload session detail: session facts grid, Review/comment panel, collapsed Server checks, Participant panel with masked values, recording timeline, tasks table, Upload history. |
| 12-devices.png | `#/admin/uploads/devices` | Devices page: health KPIs and a device table with quarantine / assign controls. |
| 13-downloads.png | `#/admin/uploads/downloads` | Downloads: pick Site/Project, filters, tick sessions, Download button (disabled until a selection). |
| 14-404.png | `#/admin/does-not-exist` | 404 page "Page not found": centered card with a Back button; no top bar, no link to the dashboard or login. |

## editor

| File | Route | What is on screen |
|---|---|---|
| 01-login.png | `#/login` | Login page, empty. Bare form top-aligned, no logo/branding, password field has no placeholder and a grey "Show" button beside it; "Editor language" selector floats top-right; rest of the page is empty. |
| 02-dashboard-home.png | `#/admin` | Admin dashboard: Monitoring cards (Uploads, Devices), "Your Assigned Sites" and "Your Assigned Projects" card grids with status and upload badges. Subtitle typo ("Selects sites to assign projects..."); heading says "Assigned" even for master who sees everything; master tool tiles at the bottom. |
| 03-user-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 04-project-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 05-site-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 06-site-detail.png | `#/admin/sites/5` | Site detail without Edit / Manage Projects (read-only): access token, country and contacts shown as a bare dash with no explanation. |
| 07-project-detail.png | `#/admin/projects/3` | Project detail: header metadata, statistics strip, Quick Actions (single Protocols card), uploads table and chart, sites table. |
| 08-project-detail-modal-edit.png | `#/admin/projects/3` | Edit project metadata modal (editor may edit). |
| 09-protocol-list.png | `#/admin/projects/3/protocols` | Protocols Management: create form (name, description, Create button), Current Protocols table, "Archived / Other Protocols" table that also lists other projects' protocols. |
| 10-protocol-create-form-filled.png | `#/admin/projects/3/protocols` | Create-protocol form with a name typed; Create button turns green. |
| 11-protocol-create-editor-new.png | `#/admin/projects/3/protocols/undefined` | Protocol Task Editor for a brand-new protocol (after "+ Create Protocol"): task library left, current protocol right, red "At least one task must be added" box, disabled Show/Save buttons. |
| 12-protocol-editor-existing.png | `#/admin/projects/3/protocols/2` | Protocol Task Editor on an existing protocol: task library, language variants, task cards inside a small scroll box, "Show designed protocol" / "Save protocol". |
| 13-participant-preview.png | `#/participant/test` | Participant preview of a protocol with 0 tasks: only the generic Audio Guide intro screen. |
| 14-uploads-list.png | `#/admin/uploads` | Uploads list: KPI cards, filter bar (search, project, protocol, date, flag chips), sessions table with server-check and review badges. Different header style from other admin pages. |
| 15-upload-session-detail.png | `#/admin/uploads/e2e00400000000000000000000000000` | Upload session detail: session facts grid, Review/comment panel, collapsed Server checks, Participant panel with masked values, recording timeline, tasks table, Upload history. |
| 16-devices.png | `#/admin/uploads/devices` | Devices page: health KPIs and a device table with quarantine / assign controls. |
| 17-downloads.png | `#/admin/uploads/downloads` | Downloads: pick Site/Project, filters, tick sessions, Download button (disabled until a selection). |
| 18-404.png | `#/admin/does-not-exist` | 404 page "Page not found": centered card with a Back button; no top bar, no link to the dashboard or login. |

## reviewer

| File | Route | What is on screen |
|---|---|---|
| 01-login.png | `#/login` | Login page, empty. Bare form top-aligned, no logo/branding, password field has no placeholder and a grey "Show" button beside it; "Editor language" selector floats top-right; rest of the page is empty. |
| 02-dashboard-home.png | `#/admin` | Admin dashboard: Monitoring cards (Uploads, Devices), "Your Assigned Sites" and "Your Assigned Projects" card grids with status and upload badges. Subtitle typo ("Selects sites to assign projects..."); heading says "Assigned" even for master who sees everything; master tool tiles at the bottom. |
| 03-user-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 04-project-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 05-site-management.png | `#/admin` | DENIED: master-only page requested by a non-master; silently redirected to the admin dashboard with no message (looks identical to 02-dashboard-home). |
| 06-site-detail.png | `#/admin/sites/4` | Site detail without Edit / Manage Projects (read-only): access token, country and contacts shown as a bare dash with no explanation. |
| 07-project-detail.png | `#/admin/projects/3` | Project detail read-only: "Mode read-only" warning next to the ACTIVE badge, grey disabled Edit; sites table cell "Last upload" concatenates "1 min ago25. 10. 2026 02:55". |
| 08-protocol-list.png | `#/admin/projects/3/protocols` | Protocols page read-only: banner "Inactive / Archived: Mode read-only" shown although the project is ACTIVE (misleading); create form and Edit/Duplicate/Archive greyed out; only Show works. |
| 09-participant-preview.png | `#/participant/test` | Participant preview of a protocol with 0 tasks: only the generic Audio Guide intro screen. |
| 10-uploads-list.png | `#/admin/uploads` | Uploads list: KPI cards, filter bar (search, project, protocol, date, flag chips), sessions table with server-check and review badges. Different header style from other admin pages. |
| 11-upload-session-detail.png | `#/admin/uploads/e2e00400000000000000000000000000` | Upload session detail: session facts grid, Review/comment panel, collapsed Server checks, Participant panel with masked values, recording timeline, tasks table, Upload history. |
| 12-devices.png | `#/admin/uploads/devices` | Devices page: health KPIs and a device table with quarantine / assign controls. |
| 13-downloads.png | `#/admin/uploads/downloads` | Downloads: pick Site/Project, filters, tick sessions, Download button (disabled until a selection). |
| 14-404.png | `#/admin/does-not-exist` | 404 page "Page not found": centered card with a Back button; no top bar, no link to the dashboard or login. |

## Not captured

- Onboarding (`/setup-account`) and reset-password (`/admin/reset-password/:token`) were not reachable from the seeded accounts.
- Participant task screens (recorder, SDMT, questionnaire) were not walked through; only the first preview screen is captured.
- clinic/reviewer cannot open the protocol editor (Edit disabled) or create a protocol, so no editor/create shots exist for them. Clinic/reviewer/editor edit-site and manage-projects modals are not available to them.
