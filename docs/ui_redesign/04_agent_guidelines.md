# UI redesign: implementation guidelines

These rules apply to everyone implementing a task from [`03_plan.md`](03_plan.md), human or agent.

- When a guideline and [`02_spec.md`](02_spec.md) disagree, the spec wins. Raise the disagreement in your report.
- The phase-B guidelines in [`../upload_management/guidelines.md`](../upload_management/guidelines.md) still apply to backend code, with one exception: their "Schema changes: additive only" rule is replaced by spec §8 for this work.

## Before you start

1. Read the spec sections your task cites and the mockup pages for your screens (`mockups/*.html`). The mockups are the visual contract: match their layout, spacing and copy.
2. Read two or three neighbouring files and copy their style. Good examples:
   - Backend: `src/controllers/siteController.js` with `siteController.test.js`.
   - Frontend, the newest code: `src/components/Uploads/**` and `src/pages/SessionDetailPage.jsx`.
3. Check the file-ownership table of your batch. **Touch only the files you own.** If you need a change elsewhere, keep it minimal and additive, and list it in your report.

## Hard boundaries

- **Desktop contract (spec §7).** Don't modify:
  - `src/routes/upload.js`, the site-config and device-checkin routers, `utils/extConfig.js`;
  - the e2e spec `uploads-ingest.spec.ts`. In `site-config.spec.ts`, only the agent of batch 4c may change the two `PUT /projects/update` setup calls (lines 70 and 83), and nothing else in the file;
  - the golden fixtures.

  If the golden test fails, your change is wrong.
- **No new dependencies.** Icons are inline SVG in `src/components/ui/icons.jsx`.
- **Versions change only in batch 4u.** Only batch 4u changes `package.json` versions or lock files. After it, write code for the upgraded APIs (Vite 8, Vitest 5, ESLint 10 flat config, i18next 26), not from older examples.
- **Nothing beyond the spec.** Don't add features, endpoints, columns or settings that the spec doesn't name.
- **Commits.** Don't commit or push. The orchestrator commits after each checkpoint.

## Frontend rules

- **Plain JSX** with function components and hooks, matching the existing code. No TypeScript conversion of existing files.
- **Styling:**
  - Colours, spacing, radii and font sizes come from `src/styles/tokens.css` variables only. No hex values in feature CSS.
  - No inline `style={{}}` except for truly dynamic values, such as a computed width.
  - Use one CSS file per page or component folder, with class names prefixed by the folder (`.studies-…`, `.clinic-…`). The UI kit uses `.ui-…`.
- **Components:**
  - Use the UI kit (`src/components/ui`): `PageHeader`, `DataTable`, `Button`, `Badge`, `StatusDot`, `Tabs`, `Modal`, `Menu`, `EmptyState`, `CopyField`, `Toast`.
  - Don't build one-off tables, buttons or modals.
- **One primary action per page.** Use `<Button variant="primary">` at most once per rendered page. The e2e test checks this.
- **Permissions:**
  - Render edit controls only when the data says you can (`can_edit`, `is_owner`, `isMaster`).
  - Don't render disabled controls for permission reasons. Show the `Received` badge and the explanation line instead.
  - The server is still the real gate, so always handle 403 and 404 with a toast.
- **Feedback:**
  - Errors use `useToast().error(message)`, never `alert()`.
  - Confirmations use `useConfirm()`, and only for destructive or far-reaching actions such as unlinking a clinic, archiving, or removing an editor.
- **Data access:**
  - Only through `src/api/<resource>.js`.
  - Loading states use the kit's skeleton or empty-state components, not a bare text paragraph.
- **Formatting:**
  - Dates go through `src/utils/formatDate.js`.
  - Never show raw ISO strings, `undefined`, `null` or `NaN`. A missing value renders as nothing, or as a muted "—" only inside tables.
- **Identifiers.**
  - UUIDs, hashes and tokens appear in a `CopyField` or are truncated with the full value in a `title` attribute.
  - The access token is masked by default.
- **Copy:**
  - Every user-visible string goes through `t()`. Add the key to **en, cs and de** at the same time. If you can't translate confidently, still write the best translation you can, and list the key in your report for review.
  - Use the UI terms from spec §3: Study, Clinic, Recording, Computer, Runs at, Editor.
  - Sentence case everywhere ("New study", not "New Study").
- **Accessibility:**
  - Every `IconButton` has an `aria-label`. Every form field has a `<label>`.
  - Interactive rows are reachable by keyboard (the `DataTable` handles this).
- **Test IDs:**
  - Keep the existing `data-testid` values when the concept survives. List any you remove.
  - New ones follow the pattern `<area>-<thing>`.

## Backend rules

- **Error codes.**
  - Validation failures return `res.status(400).json({ error: "<snake_case>" })`, using the codes named in spec §10.
  - Out-of-scope records return **404**.
  - Visible but not editable records return **403**.
- **Access checks.**
  - All access logic lives in `src/utils/accessScope.js`. Controllers call it and never write their own permission SQL.
  - A master always short-circuits before calling `accessScope`.
- **Schema.**
  - Schema changes go straight into `create_tables.sql` and `create_views.sql`. There is **no migration**: every database is recreated with `runInit.js`, so don't write `alter_*` scripts or data-copy code.
  - Use `IF EXISTS` / `IF NOT EXISTS`, and no semicolons inside comments, because `runSqlFile` splits on `;`.
- **Tests.** Every changed controller gets unit tests in the existing mock style. Access rules also get a real-DB integration test in `test/integration/`.

## Verifying your work (required before you report)

**Node:** Playwright needs Node ≥ 22.2. The default `node` on PATH may be 22.0, from gradle. Use the Node 24 install the orchestrator gives you in the brief. `npx` may be missing, so run `node node_modules/@playwright/test/cli.js …` instead.

Run the following, and paste the summary lines into your report:

| Area | Commands |
|---|---|
| Backend | `npm test` |
| Frontend | `npm test`, then `npm run build` |
| E2E (any UI or API change) | the relevant specs: `node node_modules/@playwright/test/cli.js test e2e/<spec>` |
| Screens you built | screenshots via `playwright.capture.config.ts`, after updating `e2e/tools/capture.spec.ts` for new routes. Look at them yourself before reporting. |

If something fails and you can't fix it within your files, stop and report. Don't work around it in someone else's files.

## Report format

```
Task: <id>         Status: done | partial | blocked
Files changed: <list>
Outside my ownership (why): <list or "none">
Tests: <commands + pass/fail counts>
Screenshots: <paths>
Spec deviations / open questions: <list>
Translations to review: <keys>
Removed test IDs: <list>
```
