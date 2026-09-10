# booking-service

Standalone, project-agnostic appointment booking service. Owns its own database
and its own hosted booking/manage web pages — a consuming app only needs to
call a small admin API to define availability and generate signed booking
links. It has no knowledge of any other project's domain model.

## Features

- **Multi-tenant** — any number of separate consuming apps/projects can use
  the same deployment, each fully isolated: own API key, own resources,
  slots and bookings, no cross-tenant visibility.
- **Bulk availability** — generate weeks of slots in one admin API call
  (date range, weekdays, time window, slot duration, location).
- **Signed, tamper-proof booking links** — no login for the respondent, no
  API key ever reaches the browser; a per-link eligibility date (`after`)
  and expiry (`exp`) are enforced server-side, not just decorative.
- **Self-serve booking flow** — hosted, no-build-step pages (day-grouped
  slot picker → contact form → confirmation), usable standalone or mounted
  under a host app's own path with zero configuration.
- **Reschedule / cancel** via a private manage link, automatically blocked
  inside a configurable cutoff window (24h before the appointment by
  default).
- **Capacity-safe booking** — a row lock plus a DB-level uniqueness
  constraint prevent double-booking a slot even under concurrent requests
  (see `src/services/bookingService.test.js` and the schema comment on
  `bookings_active_slot`).
- **Email notifications** — confirmation, reschedule, and cancellation
  emails via your own SMTP account.
- **Optional Google Calendar sync** — one-way push of bookings to a shared
  team calendar; the whole service works identically with this unset
  (sync is just silently skipped and logged).
- **Webhooks** — notify a consuming app of `booking.created` /
  `booking.rescheduled` / `booking.cancelled` instead of polling.
- **CSV export** of a resource's bookings.
- **Plain HTTP admin API** — usable from any backend in any language, not
  tied to this repo's stack.
- **Localized** (English/Czech/German out of the box) — both the hosted
  pages and every email; see "Localization" below.

## Concepts

- **Tenant** — a consuming app/project. Has an API key (server-to-server admin
  calls) and a link-signing secret (for the public booking flow).
- **Resource** — a bookable "thing" for that tenant, e.g. "Standardized Room
  Retest". Identified by a slug used in hosted page URLs.
- **Slot** — a specific bookable time window on a resource.
- **Booking** — one reservation against a slot, with a `manage_token` that is
  itself the credential for the respondent-facing reschedule/cancel page.

## Setup

```
cp .env.example .env   # fill in DB_*, SMTP_*
npm install
npm run db:init         # creates the schema (drops it first — safe to re-run in dev)
npm run tenant:create -- "My Project"   # prints an API key + link signing secret, shown once
npm run dev
```

Then, as the tenant:

1. `POST /v1/resources` (Bearer API key) to create a bookable resource.
2. `POST /v1/slots/bulk` to generate availability.
3. Build a signed link server-side: `sig = HMAC-SHA256(linkSigningSecret, "<tenantId>|<resourceSlug>|<ref>|<after>|<exp>")`,
   then point the respondent at
   `<PUBLIC_BASE_URL>/book/<resourceSlug>?tenant=<tenantId>&ref=<ref>&after=<isoDate>&exp=<unixTs>&sig=<sig>`.
   `ref` is any opaque string you use to identify the respondent on your side;
   `after` is the earliest date you want to allow (compute your own
   business-rule minimum notice here — this service just filters on the date
   you pass); `exp` is a unix timestamp the link stops working after.
4. That page is fully self-contained — slot browsing, contact form, booking,
   confirmation email, and (if configured) a Google Calendar event, all
   happen without your app being involved again. The confirmation email
   contains a `/manage/<manageToken>` link the respondent can use to
   reschedule/cancel until one day before the appointment.
5. Optionally register a webhook (`POST /v1/webhooks`) to be notified of
   `booking.created` / `booking.rescheduled` / `booking.cancelled` events
   instead of polling `GET /v1/bookings`.

## Localization

Both the hosted pages and every email support `en` (default), `cs`, and
`de` out of the box. No i18next or build step — deliberately two small,
plain-object dictionaries instead, consistent with this service's "no
build step" design:

- `src/i18n/emailTranslations.js` — server-side, used by `emailService.js`.
- `public/i18n.js` — client-side, used by `book.js`/`manage.js`.

These two files are **not shared code** (one runs in Node, one in the
browser, and there's no bundler here to unify them) — keep their locale
sets in sync by convention when adding a language or a new string.

**How the locale is chosen:**
- On the booking page, an explicit `?lang=cs` on the signed link wins;
  otherwise the browser's own language is used, falling back to English.
  A consuming app that knows the respondent's language (e.g. from its own
  UI) should append `&lang=<code>` when building the signed link.
- Once a booking is made, that page's resolved locale is sent along as
  `lang` in the booking request and stored on the booking
  (`bookings.locale`) — every subsequent email for that booking
  (confirmation, reschedule, cancellation) uses that same stored locale,
  and the manage-page link handed out in those emails carries
  `?lang=<code>` too, so the whole thread stays in one language regardless
  of what the browser opening the manage link later defaults to.

Adding a fourth language: add a key to the `TRANSLATIONS` object in each
of the two files above (same key names in both — see the existing three
for the shape) and add it to `SUPPORTED_LOCALES`'s source array in
`emailTranslations.js`. `src/i18n/emailTranslations.test.js` will catch a
locale that's missing a key the others have.

## Google Calendar sync (optional)

Booking works fully without this configured — Calendar sync is skipped and
logged if unset. Everything below is free: no billing account or card is
ever required for the Calendar API.

1. **Open/create a project.** Go to
   [console.cloud.google.com](https://console.cloud.google.com). Use the
   project picker at the top left ("My First Project" is fine, or create a
   new one) — this just groups the API access together, nothing to pay for.

2. **Enable the Calendar API.** Left menu (☰) → **APIs & Services** →
   **Library**. Search "Google Calendar API", open it, click **Enable**.
   (This step alone is what "API Library" is for — a service account is
   *not* created here, which is what tripped things up: it lives under IAM
   & Admin, step 3 below.)

3. **Create a service account.** Left menu (☰) → **IAM & Admin** →
   **Service Accounts** → **+ Create Service Account** (top of the page).
   Give it any name, e.g. `booking-service-calendar-sync` → **Create and
   Continue**. On the next screen ("Grant this service account access to
   project") just click **Continue** without picking a role — no
   Google-Cloud-level role is needed, access is granted directly in Google
   Calendar's own sharing UI in step 6. Click **Done**.

4. **Create + download its JSON key.** Click the service account you just
   created in the list → **Keys** tab → **Add Key** → **Create new key** →
   choose **JSON** → **Create**. A `.json` file downloads immediately —
   move it somewhere this server can read, and set
   `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` to that path.

5. **Copy the service account's email.** Still on that service account's
   page, near the top — it looks like
   `booking-service-calendar-sync@<your-project-id>.iam.gserviceaccount.com`.
   (It's also inside the downloaded JSON, as `"client_email"`.)

6. **Share a calendar with it.** Go to
   [calendar.google.com](https://calendar.google.com) with whichever Google
   account should own the calendar (a plain personal Gmail account is
   fine — Workspace is not required). Find the calendar in the left
   sidebar → ⋮ → **Settings and sharing** → **Share with specific people or
   groups** → **+ Add people and groups** → paste the service account's
   email → set permission to **Make changes to events** → **Send**.

7. **Copy the Calendar ID.** Same settings page, scroll to **Integrate
   calendar** → copy **Calendar ID** (for your main calendar it's just your
   email address; for a separate dedicated calendar it looks like
   `xxxxxxx@group.calendar.google.com`). Set `GOOGLE_CALENDAR_ID` to that
   value.

## Running mounted inside another process

Instead of `npm start`/`npm run dev` (its own port), a host app can mount it
directly: `import { createBookingApp } from "booking-service/src/app.js"`
then `app.use("/some-prefix", createBookingApp())`. Nothing needs
configuring for this — the hosted pages detect their own mount prefix from
the page URL at load time (see the inline bootstrap script at the top of
`public/book.html`/`manage.html`). Useful when there's no way to register a
second app/port/DNS entry (e.g. constrained shared hosting) and the service
can instead ride inside an already-provisioned process. `PUBLIC_BASE_URL`
must still be set to the fully-qualified address the service is reachable
at *including* that prefix, since it's used to build the manage-link inside
confirmation emails (an absolute link, not a page-relative one).

## Testing

### Unit tests

```
npm test
```

Unit tests only (no DB needed) — `src/utils/dateHelpers.test.js` covers the
slot-generation calendar math and the reschedule/cancel cutoff, and
`src/utils/linkSigning.test.js` covers signed-link HMAC verification
(tampering, expiry, wrong secret). `src/services/bookingService.test.js`
covers `createBooking`'s availability/capacity logic against a mocked DB
connection (see `assignmentHelper.test.js` in the main app's backend for the
same mocking convention this follows) — including that it locks the slot row
with `FOR UPDATE` before checking availability. A real concurrent-request
race isn't exercised here (would need a live DB with two overlapping
transactions); the actual backstop for that is the `bookings_active_slot`
generated-column UNIQUE constraint in `scripts/schema/create_tables.sql`,
which enforces "at most one active booking per slot" at the DB level even if
the application-level check above were ever bypassed.

### Manual end-to-end testing (dev)

There's no login/UI to click through by hand until a real signed link
exists, so testing the actual booking flow is: create a resource and some
slots via the admin API, generate a signed link, then open it in a browser.

**0. One-time, if you don't already have a tenant:** run
`npm run tenant:create -- "My Test Tenant"` in a second terminal (leave
`npm run dev` running in the first) and copy its three printed values —
`BOOKING_SERVICE_TENANT_ID`, `BOOKING_SERVICE_API_KEY`,
`BOOKING_SERVICE_LINK_SIGNING_SECRET`. Everything below assumes you've
substituted those in for `<API_KEY>` / `<TENANT_ID>` /
`<LINK_SIGNING_SECRET>` (including the `<` `>` being removed — they're
placeholders, not literal characters to paste).

The commands below are single-line on purpose so they're safe to paste into
either shell.

**On Windows PowerShell**: use `curl.exe` explicitly, not plain `curl` —
PowerShell aliases `curl` to `Invoke-WebRequest`, which takes different
flags (`-Method`/`-Headers`/`-Body`) and will silently misinterpret
`-X`/`-H`/`-d`. Even with `curl.exe`, PowerShell's own quoting rules mangle
an embedded JSON string before curl ever sees it (both `\"`-escaped
double-quotes and plain single-quoted JSON get corrupted in transit) — the
reliable fix, verified against this actual server, is the `--%`
stop-parsing token, which tells PowerShell to stop processing the rest of
the line itself and hand it to curl.exe untouched:

```powershell
curl.exe --% -X POST http://localhost:4100/v1/resources -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" -d "{\"slug\":\"test-resource\",\"name\":\"Test Resource\",\"defaultDurationMin\":45}"
# -> {"id": <RESOURCE_ID>, ...} — note that id, resource ids auto-increment
# globally (not per-tenant, not reset by tenant), so it will NOT reliably be
# 1 once any resource has ever been created before, including in past
# testing. Use the real value below.

curl.exe --% -X POST http://localhost:4100/v1/slots/bulk -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" -d "{\"resourceId\":<RESOURCE_ID>,\"startDate\":\"2026-09-14\",\"endDate\":\"2026-09-18\",\"weekdays\":[1,2,3,4,5],\"startTime\":\"09:00\",\"endTime\":\"16:00\",\"durationMin\":45}"

npm run link:generate -- <TENANT_ID> <LINK_SIGNING_SECRET> test-resource dev-test 2026-09-14
```

(`--%` disables PowerShell variable expansion for the rest of that line
too, which is fine here since `<API_KEY>` etc. are placeholders you're
editing by hand anyway, not PowerShell variables.)

**On macOS/Linux/Git Bash**, plain `curl` with single-quoted JSON works
normally — no escaping needed:

```bash
curl -X POST http://localhost:4100/v1/resources -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" -d '{"slug":"test-resource","name":"Test Resource","defaultDurationMin":30}'
# -> {"id": <RESOURCE_ID>, ...} — resource ids auto-increment globally, so
# this will not reliably be 1; use the real value below.

curl -X POST http://localhost:4100/v1/slots/bulk -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" -d '{"resourceId":<RESOURCE_ID>,"startDate":"2026-09-14","endDate":"2026-09-18","weekdays":[1,2,3,4,5],"startTime":"09:00","endTime":"16:00","durationMin":30}'

npm run link:generate -- <TENANT_ID> <LINK_SIGNING_SECRET> test-resource dev-test 2026-09-14
```

`link:generate` prints a `/book/test-resource?...` path — prepend
`http://localhost:4100` and open it in a browser. From there: pick a slot,
submit the contact form, confirm the email arrives and (if Google Calendar
is configured) the event shows up, then open the `/manage/<token>` link
from that email to exercise reschedule/cancel and the 24h cutoff.

### Testing in production

There's no separate "test mode" in the code — the same paths run
identically regardless of environment; what changes is only which `.env`
the process was started with (DB, SMTP, Calendar credentials) and, for a
mounted deployment, the URL prefix. So a production smoke test is the exact
same recipe as above, pointed at the production URL/DB/API key instead of
localhost:

- `GET <PUBLIC_BASE_URL>/health` — quick liveness check.
- Create a dedicated, obviously-named resource (e.g. `smoke-test`) rather
  than reusing a real one, so test bookings don't clutter real availability
  or the real team calendar. Delete its slots afterward via
  `DELETE /v1/slots/:slotId`, or just leave the resource in place, inactive,
  and reuse it for the next smoke test.
- If you want real isolation instead of a throwaway resource — e.g. a
  staging pass before every release — run a second instance pointed at a
  separate `DB_NAME` (and ideally a separate test Google Calendar); nothing
  about the code assumes there's only ever one deployment.
- Use `npm run link:generate` locally with the *production* tenant's
  `LINK_SIGNING_SECRET` to produce a link to test against
  `<PUBLIC_BASE_URL>` — the secret is copy-pasted in for one command, not
  stored anywhere new by doing this.

## Known v1 simplifications

- Slot times are naive local wall-clock values — this service assumes it's
  deployed in the same timezone as the physical resource being booked.
- Capacity is always created as 1 (the schema supports more, but nothing
  generates or books multi-capacity slots yet).
- Rescheduling shows all future open slots for the resource and does not
  re-enforce whatever minimum-notice rule (`after`) gated the original
  booking.
