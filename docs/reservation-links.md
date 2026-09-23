# Reservation links

How a participant's follow-up booking link (protocol → `booking-service`) is
built, what it requires, and what the Fieldwork admin table shows for it.
Spans three packages: `backend/`, `booking-service/`, `frontend/`.

## The link itself

`buildBookingLink` (`backend/src/services/bookingServiceClient.js`) builds a
stateless, signed URL:

```
{BOOKING_SERVICE_URL}/book/{resourceSlug}?tenant=&ref=&after=&exp=&sig=&lang=
```

- `ref` is this app's `participant_protocols.id` — not a fresh secret, just a
  correlation id. Unforgeability comes entirely from `sig`.
- `sig` is an HMAC-SHA256 over `tenant|resourceSlug|ref|after|exp`, verified
  server-side in `booking-service` (`resolveSignedResource`). Nothing is
  looked up or stored when the link is built — it can be regenerated
  identically at any time from `(ref, completedAt)`, which is why the same
  call also powers the Fieldwork table's "resend link".
- Only buildable once `sessions.completed_at` is set (both
  `bookingController.getBookingLink` and `projectController.getProjectFieldwork`
  gate on this). No completed session → no link, anywhere.

Before choosing which link to hand back, `bookingController.getBookingLink`
first checks whether this respondent already has an active appointment, via
`getActiveManageTokenByRef` (a single targeted lookup —
`GET /v1/bookings/active-manage-token?resourceId=&externalRef=` on
booking-service, backed by the same indexed query `getPublicSlots` already
used internally to redirect to `/manage` after the slot picker had loaded).
If one exists, it returns `buildManageLink(...)` instead of
`buildBookingLink(...)` — so `BookingStep.jsx` embeds the manage/reschedule
page directly, rather than always loading the slot picker first and letting
booking-service's own client-side check (`public/book.js`'s `existingBooking`
handling) redirect it after an extra round trip. That client-side check is
kept too, as a fallback (e.g. a booking made in another tab after this link
was issued).

### Opening the link standalone (not embedded)

The same `/book` page is also opened outside any iframe entirely — an
emailed link (cases 3/4), or the Fieldwork table's link column — not just
inside `BookingStep.jsx`. `book.html`'s own Next button is hidden by
default, because the embedded case relies on the parent app's fixed footer
button instead (driven by `book.js`'s `next-state`/`next-click`
`postMessage` contract). `book.js` now un-hides it on load whenever
`window.parent === window.self` (no parent frame) — otherwise a standalone
visit shows the slot list and contact form with no way to submit at all.

## The four states

| State | What happened | Link the participant gets | Contact info |
|---|---|---|---|
| **1. Not completed** | Protocol in progress or abandoned before the last task | none | — |
| **2. Completed, dropped mid-reservation** | Reached the booking step, closed the tab before choosing | Resuming the protocol (same access-token link, indefinitely once `sessions.completed=1`) re-mounts `BookingStep`, which re-fetches a fresh signed `/book` link | asked, unless already on file (see below) |
| **3. Slot booked** | Picked a slot + contact info | Confirmation/reschedule email carries a **`/manage/:manage_token`** link (different credential type — possession of the token *is* the authorization) | required once, to create the booking |
| **4. "No slot works"** | Declined all slots, left contact info instead | Follow-up email carries a **fresh signed `/book` link** (same shape as the original) | required once, to send the follow-up |

Cases 3 and 4 use genuinely different link types because they authorize
different things: a `/manage` link lets you cancel/reschedule a real
appointment; a signed `/book` link only lets you book fresh or leave contact
info again.

### Case 2 in detail: reopening the link mid-reservation

`BookingStep.jsx` calls `markSessionCompleted` the moment it mounts —
*before* the participant has picked anything — because booking-service's
link endpoint requires `sessions.completed_at` to already be set (case 1's
gate). That sets `sessions.completed = 1` immediately, well ahead of the
booking actually being finished.

`sessionController.initSession`'s resume logic depends on that same
`completed` flag: with `ALLOW_PROTOCOL_RERUN` off (the production default),
any session with `completed = 1` is handed back as-is, at its existing
`current_task_index` — which, for someone who just reached the booking step,
*is* the booking step's index, so they land right back on it. This part
works by design and is covered by `sessionController.test.js`.

`ALLOW_PROTOCOL_RERUN` was, however, hardcoded to `true` (`backend/src/config/constants.js`,
ignoring `process.env` entirely) rather than defaulting to `false` as its own
comment described — a leftover from local testing. With it forced on
everywhere, the "hand back the completed session" shortcut above never ran:
`initSession` instead looked for an *incomplete* session (`completed = 0`),
found none (the row was already flagged completed by `markSessionCompleted`),
and fell through to inserting a brand-new session — silently discarding the
participant's entire completed run and restarting them at task 1 instead of
the booking step. Fixed by restoring the env-gated read
(`process.env.ALLOW_PROTOCOL_RERUN === "true"`), so rerun is opt-in again
per environment, as documented right above it in `constants.js`.

## Not re-asking for contact info

`booking-service`'s `GET /public/slots/:resourceSlug` returns `knownContact`
— the most recent `contact_email`/`contact_phone` on file for this
`(resource, ref)`, from *any* prior booking, cancellation, or no-slot report
(`getLatestContactByRef`). `public/book.js`'s `applyKnownContact()` hides and
pre-fills the fields when present. Contact info is still required to submit
(DB `NOT NULL`, API validation, UI `required`) — the only thing that changes
is whether the participant is asked again. First-ever submission for a given
`ref` always asks, since there is nothing to email a follow-up to otherwise.

## The Fieldwork table's reservation column

`getProjectFieldwork` (`backend/src/controllers/projectController.js`) merges
booking-service state into each row via `getFollowupBookingStatusByRef`
(`backend/src/services/bookingServiceClient.js`), which now calls **two**
booking-service admin endpoints and merges them by `external_ref`:

- `GET /v1/bookings` — real bookings (has a `slot_id`).
- `GET /v1/no-slot-reports` — case-4 reports (`status: 'requested'`, no
  `slot_id`). `listBookingsForAdmin`'s query inner-joins on `slots`, so
  these never show up in the first endpoint — they were invisible in the
  Fieldwork table until this was added.

Per `ref`, an active booking (`booked`/`rescheduled`) always wins; otherwise
the most recently updated of whatever's left (`cancelled` or `requested`)
wins.

The row's `reservation_link` is then picked to match what was actually
emailed:

- Active booking → `buildManageLink({ manageToken, lang })` →
  `/manage/:manage_token`.
- Anything else (never booked, cancelled, or a `requested` no-slot report),
  as long as the session is completed → `buildBookingLink(...)` → the signed
  `/book` link.

`frontend/src/components/Fieldwork/reservationStatus.js` turns
`reservation_status: 'requested'` into a distinct `no_slot_reported` display
state (labelled "No Slot Found"), always shown in the same urgent red as an
overdue row — it's an explicit "none of these work for me" from the
respondent, not silence, so it doesn't wait on the grace period the way
`not_booked` does. It's also its own dedicated Reservation-column filter
option, not folded into "Pending"/"Needs Follow-up".

A cancellation (`reservation_status: 'cancelled'`) gets the same treatment:
its own `cancelled` display state (labelled "Cancelled"), always shown in
that same urgent red and its own filter option, regardless of how long ago
it happened. Like the no-slot report, it's an explicit signal from the
respondent rather than silence, so it isn't anchored on any date or subject
to the `RESERVATION_FOLLOWUP_DAYS` grace period the way "never booked" is.

The free-text note left alongside a no-slot report (`preferred_times` in
booking-service's `bookings` table — "mornings would work", etc.) is merged
in the same way as `reservation_link`, as `reservation_preferred_times`, and
shown in its own "Reservation Notes" column — hidden by default (like
"Reservation Link"), small/italic and truncated with the full text on hover,
since it's an aside rather than primary data.

## Where things live

| Concern | File |
|---|---|
| Build the signed `/book` link | `backend/src/services/bookingServiceClient.js` → `buildBookingLink` |
| Build the `/manage` link | same file → `buildManageLink` |
| Check for an active booking before choosing a link | same file → `getActiveManageTokenByRef`; participant-facing lookup in `bookingController.getBookingLink`; underlying single-ref query in `booking-service/src/services/bookingService.js` → `getActiveManageTokenByRef`, exposed at `GET /v1/bookings/active-manage-token` |
| Verify a signed link | `booking-service/src/utils/linkSigning.js` → `verifyBookingLink` |
| Public booking flow (slots, contact, no-slot) | `booking-service/src/controllers/publicController.js` |
| Known-contact prefill | `booking-service/public/book.js` → `applyKnownContact` |
| Emails per state | `booking-service/src/services/emailService.js` |
| Merge booking status for Fieldwork | `backend/src/services/bookingServiceClient.js` → `getFollowupBookingStatusByRef` |
| Fieldwork link selection | `backend/src/controllers/projectController.js` → `getProjectFieldwork` |
| Fieldwork display state | `frontend/src/components/Fieldwork/reservationStatus.js` |
| Resume mid-protocol | `backend/src/controllers/sessionController.js` → `initSession` |
| Booking step (iframe host) | `frontend/src/components/Booking/BookingStep.jsx` |
