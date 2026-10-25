# UI audit: current state (branch `newshare`, 2026-10-25)

**Screenshots.**
- There are 75 full-page screenshots at 1440×900, for four personas, in [`screens/before/`](screens/before/INDEX.md).
- The set was produced by `frontend/e2e/tools/capture.spec.ts`. To regenerate it, run `npx playwright test -c playwright.capture.config.ts` from `frontend/` (needs Node ≥ 22.2).

**Personas used.**
- `master`: everything.
- `clinic`: one clinic grant.
- `editor`: one editable project.
- `reviewer`: one read-only project.

These are the e2e seed users. The audit judges the app against the agreed model in [the plan](03_plan.md) (Study / Clinic / Recording / Computer, access = assigned clinics).

## Verdict in one paragraph

The app has two generations of UI.
- **The newer generation** is the Recordings area: Uploads list, session detail and Devices, built in phase B. It is close to the target. It uses white cards, a KPI strip, quiet pills, sortable tables and clear empty states.
- **The older generation** is the dashboard, site, project, protocol and management pages. It uses grey panels inside grey panels and saturated multi-coloured buttons, and the hierarchy is navigated only with "← Back".

**Recommendation:** promote the Recordings visual language to the design system. Rebuild the older pages on it, and change the navigation model so the user never has to work out *where* a thing lives.

## A. Information architecture: the core confusion

| # | Problem | Evidence |
|---|---|---|
| A1 | **There is no global navigation.** Every page has only "← Back", user, logout and language. To get from a protocol to the recordings you go back to the dashboard and down again. | every screenshot |
| A2 | **The dashboard is a wall of equal tiles.** Monitoring, Sites, Projects and Master tools all look alike. Nothing says what to do next. The subtitle explains the model in prose ("Select a project to manage its protocols. Selects sites…"), which is a sign the model isn't visible in the UI. The subtitle also has a typo. | `master/02`, `clinic/02` |
| A3 | **Each entity has two homes.** Sites and projects appear as dashboard tiles (browse) *and* in master-only management tables (edit). Both open the same modals. | `master/02` vs `master/08`, `master/11` |
| A4 | **Site and project pages are visual twins** (a header, a five-number grey stats band, an uploads block, a related table). Two different concepts look identical, so users can't tell which they're on. | `master/14` vs `master/17` |
| A5 | **Protocols are buried.** On a study page they sit behind one "Quick Actions" card holding a single action. The clinic page shows only a count, "1 Inherited Protocols", which also counts language variants (F-014). The clinic page never says *what its computers will download*, which is the single most important fact about a clinic. | `master/17`, `master/14` |
| A6 | **The protocol list mixes studies.** "Archived / Other Protocols" lists protocols from *another* study ("Speech battery / SPEECH STUDY") under Test Study 001. | `master/19` |
| A7 | **Recordings have about 5 entry points:** the home card, the site block, the project block, the Downloads tile, and "Go to Downloads". Downloads is a master "tool" although it is a recordings action. | `master/02`, `master/14`, `master/28` |
| A8 | **Permissions are invisible or wrong.** A read-only grant on an *active* study shows "Inactive / Archived: Mode read-only". Master-only pages silently redirect to the dashboard. Missing rights show bare dashes. "Your Assigned Sites/Projects" is shown to a master, who sees everything. | `clinic/08`, `reviewer/08`, `clinic/03-05`, `master/02` |
| A9 | **One-clinic users get the multi-clinic UI.** A clinician with one clinic sees a "Your Assigned Sites" grid holding one tile, then a project grid holding one tile. | `clinic/02` |

## B. Hierarchy and actions

| # | Problem | Evidence |
|---|---|---|
| B1 | **No single primary action.** The protocol list puts four equally loud buttons on every row (purple Show, blue Edit, orange Duplicate, red Archive). The editor has six saturated buttons in five colours. | `master/19`, `master/22` |
| B2 | **Creating a protocol is a bare inline form** at the top of the list. Its language is hard-coded to EN. After saving it opens `/protocols/undefined` (F-058). | `master/20`, `master/21` |
| B3 | **The protocol editor is a form, not a workspace.** The task list is a tiny inner scroll box. Identifiers, file name, PDF and language variants are crowded into one header. A red warning ("version will be incremented") is always on, even before any edit. | `master/22` |
| B4 | **Clinic settings sit in one long modal** that mixes identity, the access token (with a warning) and desktop-app settings. It shows raw codes ("en", "CIRCLE"), and some placeholders look like values ("63", "USB audio CODEC"). | `master/13` |
| B5 | **The Users screen** uses unlabelled icon buttons (pen, plus, building, no-entry). The table is clipped inside its own scroll box. The modals expose all three access layers. | `master/03-07` |
| B6 | **Dead ends.** The 404 page has no navigation. The login page has no product name. | `master/28`, `master/01` |

## C. Visual system

| # | Problem | Evidence |
|---|---|---|
| C1 | **Three page-chrome variants:** a blue pill Back with an orange Logout, a plain Back with a plain Logout (Recordings), and "← Back to uploads". | `master/14` vs `master/25` vs `master/26` |
| C2 | **Grey-on-grey panels** (a grey band with white cards inside a grey page) on the older pages, against white cards on the newer ones. | `master/14`, `master/17`, `master/19` |
| C3 | **Colour carries no meaning.** Blue, purple, orange, red and green are used for buttons, not for state. Orange is both "Log out" and "Duplicate". | `master/19`, `master/22` |
| C4 | **Emoji as icons** (📍 👤 🏛️ 📋 📂). Empty fields show as an emoji followed by "—". | `master/14`, `master/17` |
| C5 | **Four date formats:** `25. 10. 2026`, `Oct 25, 2026, 2:55 AM`, `10/25/2026` and `2026-01-01`. | uploads, devices, site detail, management |
| C6 | **Broken strings:** "1 min ago25. 10. 2026 02:55" (concatenated), "recorded at on 13. 10. 2026", "input gain 80 %" or "undefined %" (F-035), and a site field with only a pin and no value (F-043). | `clinic/07`, `master/26` |
| C7 | **Raw identifiers dominate.** Device UUIDs, the full 32-character access token in clear text, and session and file IDs fill columns that a human doesn't read. | `master/14`, `master/25`, `master/26` |

## D. What already works (keep)

- **Recordings list** (`master/25`):
  - a KPI strip whose numbers act as filters;
  - filter chips with counts;
  - a server check shown with a reason ("Device not registered", "Manifest hash mismatch");
  - review pills;
  - row actions limited to view and download.
- **Session detail** (`master/26`):
  - a clear header (patient · visit · status), with Previous/Next navigation and one primary Download;
  - Review set as a 4-way choice with comments;
  - masked participant fields with an explicit reveal.
  This is the template for every detail page.
- **The language switcher, and HashRouter deep links.**

## E. Design principles for the redesign (derived from the above)

1. **One way to each thing.** Every entity has one list and one detail page. Navigation is persistent, and you never need "Back".
2. **The structure explains itself.**
   - Studies own protocols.
   - Clinics own computers and recordings.
   - "Runs at" is the visible link between the two.
   - No prose explanations of the model.
3. **The home screen is the work.** Recordings to review come first, for everyone.
4. **One primary action per screen.** Everything else is secondary, quiet, or in a "⋯" menu.
5. **Colour = state.** One accent for primary actions. Green, amber, red and grey only for status.
6. **Show permission, don't hide it.** Received studies carry a 🔒 badge with a one-line reason, and an action you can't take is absent rather than broken.
7. **Humans first, IDs on demand.** Show names and relative times. Tokens and UUIDs are masked, with a copy control.
8. **Scale down gracefully.** A user with one clinic never sees a list of one.
