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

## The four states

| State | What happened | Link the participant gets | Contact info |
|---|---|---|---|
| **1. Not completed** | Protocol in progress or abandoned before the last task | none | — |
| **2. Completed, dropped mid-reservation** | Reached the booking step, closed the tab before choosing | Resuming the protocol (same access-token link, within `SESSION_RESUME_WINDOW_HOURS`, or indefinitely once `sessions.completed=1`) re-mounts `BookingStep`, which re-fetches a fresh signed `/book` link | asked, unless already on file (see below) |
| **3. Slot booked** | Picked a slot + contact info | Confirmation/reschedule email carries a **`/manage/:manage_token`** link (different credential type — possession of the token *is* the authorization) | required once, to create the booking |
| **4. "No slot works"** | Declined all slots, left contact info instead | Follow-up email carries a **fresh signed `/book` link** (same shape as the original) | required once, to send the follow-up |

Cases 3 and 4 use genuinely different link types because they authorize
different things: a `/manage` link lets you cancel/reschedule a real
appointment; a signed `/book` link only lets you book fresh or leave contact
info again.

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
state (labelled "No Slot Found", falling into the same "Needs Follow-up"
bucket once overdue as `cancelled`/`not_booked`).

## Where things live

| Concern | File |
|---|---|
| Build the signed `/book` link | `backend/src/services/bookingServiceClient.js` → `buildBookingLink` |
| Build the `/manage` link | same file → `buildManageLink` |
| Verify a signed link | `booking-service/src/utils/linkSigning.js` → `verifyBookingLink` |
| Public booking flow (slots, contact, no-slot) | `booking-service/src/controllers/publicController.js` |
| Known-contact prefill | `booking-service/public/book.js` → `applyKnownContact` |
| Emails per state | `booking-service/src/services/emailService.js` |
| Merge booking status for Fieldwork | `backend/src/services/bookingServiceClient.js` → `getFollowupBookingStatusByRef` |
| Fieldwork link selection | `backend/src/controllers/projectController.js` → `getProjectFieldwork` |
| Fieldwork display state | `frontend/src/components/Fieldwork/reservationStatus.js` |
| Resume mid-protocol | `backend/src/controllers/sessionController.js` → `initSession` |
| Booking step (iframe host) | `frontend/src/components/Booking/BookingStep.jsx` |
