# Spec: sortable Recordings table + Reset sort

## Context
Note in `docs/notes/notes_for_agent_app_web.md` (Web, last bullet): the Recordings list should be sortable by its
columns, and a dedicated button should reset a custom sort. Today the plumbing exists, but nothing in the UI uses it:
`?sort=&dir=` is read by `readFilters`, sent by `toApiParams`, and whitelisted on the server (`SORTS` in
`backend/src/controllers/uploadController.js:40`). The only way to sort now is editing the URL by hand.

```
Goal:        Clinicians can order the Recordings list by a column and get back to the default order in one click.
Deliverable: Clickable, server-sorted column headers + a "Reset sort" button in the Recordings table
             (Recordings page and the study/clinic Recordings tabs, which reuse RecordingsTable).
```

## Acceptance criteria (checkable)
1. Headers **Received, Patient, Clinic, Length, Server check, Review** are sort buttons. Select, Study/Protocol, Tasks and Flags are not.
2. Clicking a header cycles **asc → desc → default** (the 3rd click removes the sort). Clicking another header starts it at asc.
3. Sorting happens **on the server across all pages** (`sort`/`dir` sent to GET /uploads), not within the loaded page. Changing the sort returns to page 1.
4. The active header shows ▲/▼ and `aria-sort`. The others show nothing.
5. **Reset sort** appears in the filter bar only while a custom sort is active. Clicking it removes `sort`/`dir`, keeps the filters and goes back to page 1.
6. Default order (no `sort` in the URL) is unchanged: newest first, unreviewed grouped first (`orderRows`). An explicit sort, including Received ↓, turns the unreviewed grouping off.
7. The sort is kept in the URL on the Recordings page (survives reload/back, shareable). The study tab keeps it in local state (`syncUrl=false`); the clinic tab, like the page, uses the URL. Prev/Next on the detail page follows the sorted order (via `ctx`), and the CSV export uses the same order.
8. Other `DataTable` users behave exactly as before.
9. "Reset sort" is translated in en/cs/de `uploads.json`.

## Verification plan
- Unit (vitest): `recordingsQuery.test.js` covers the cycle helper, the explicit vs. default flag, `orderRows` skipping explicit Received↓, and `toApiParams`. A DataTable test covers controlled mode not reordering rows and calling `onSortChange`. Existing DataTable tests keep passing.
- Backend: no change. The existing `uploadController.test.js` sort tests are run once to confirm.
- E2E (Playwright, `frontend/e2e/uploads-list.spec.ts`, local Docker MariaDB `tp-mariadb`; ask the user to start Docker Desktop if it is down): clicking Review sends `sort=qc&dir=asc`, the URL updates, and the order spans pages. The 3rd click and Reset both return to the default order and hide the button.
- Manual: run the app, sort each column, reload, open a detail page and check Prev/Next. Then `/verify`.

## Key decisions
- **Controlled sort in `DataTable`**: new optional props `sort` + `onSortChange`. When `onSortChange` is given, DataTable renders the arrows but does **not** reorder rows; the server does. Uncontrolled behaviour stays as it is for every other table. Rejected: DataTable's built-in client sort, which would only sort the current page.
- **"Custom sort" = `sort` present in the query**, not "≠ receivedAt desc". `readFilters` gains `customSort: sp.has("sort")`. `orderRows` and the Reset button use it. This lets the cycle tell Received↓ (explicit) apart from the default. `toApiParams` may still omit receivedAt/desc, since the server default is the same.
- Column key → sort key: receivedAt→`receivedAt`, patient→`patient`, clinic→`site`, length→`durationS`, status→`status`, qc→`qc`. Server check and Review use the server's semantic order (asc: invalid, validating, valid / review, unreviewed, ok, excluded).
- A pure helper `nextSort(current, key)` in `recordingsQuery.js` handles the cycle and returns the URL patch (`{sort, dir}` or `{sort:"", dir:""}`). `update()` already resets the page.

## Files
- `frontend/src/components/ui/DataTable.jsx`: controlled `sort` / `onSortChange`
- `frontend/src/components/Recordings/recordingsQuery.js` (+ test): `customSort`, `orderRows` change, `nextSort`, `SORT_KEYS` map
- `frontend/src/components/Recordings/RecordingsTable.jsx`: `sortable`/`sortKey` on the six columns; pass `sort` and `onSortChange={(k) => list.update(nextSort(list.f, k))}`
- `frontend/src/components/Recordings/useRecordingsList.js`: expose `resetSort = () => update({sort:"", dir:""})` and `customSort`
- `frontend/src/components/Recordings/RecordingsFilters.jsx`: "Reset sort" quiet button (`data-testid="recordings-reset-sort"`)
- `frontend/src/i18n/{en,cs,de}/uploads.json`: `recordings.resetSort`
- `frontend/e2e/uploads-list.spec.ts`: sort test
- Spec copy saved to `docs/recordings_sort/spec.md` (per the docs-before-code rule)

## Increments
1. Spec saved to docs + `recordingsQuery` helpers and unit tests → checkpoint: vitest green.
2. DataTable controlled mode + test → checkpoint: all DataTable/vitest tests green.
3. Wire RecordingsTable, Reset button, i18n → checkpoint: manual run, screenshot of a sorted list and the Reset button.
4. E2E test + `/verify` against criteria 1–9 → checkpoint: Playwright green, results reported.

## Assumptions (veto any)
- The first click on any column is ascending, Received included (Received↓ is close to the default anyway).
- "Clear filters" keeps clearing everything, sort included, as it does now.
- No backend change, so Study and Tasks stay unsortable for now and could be added later.

## Out of scope
Sorting by Study, Tasks or Flags. Multi-column sort. Changing the default order. Desktop app or contract changes.
