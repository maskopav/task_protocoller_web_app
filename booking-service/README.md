# booking-service

Standalone, project-agnostic appointment booking service. Owns its own database
and its own hosted booking/manage web pages — a consuming app only needs to
call a small admin API to define availability and generate signed booking
links. It has no knowledge of any other project's domain model.

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

## Google Calendar sync (optional)

Booking works fully without this configured — Calendar sync is skipped and
logged if unset. To enable a one-way push of bookings to a shared team
calendar:

1. Create/select a project in Google Cloud Console.
2. Enable the "Google Calendar API".
3. Create a Service Account, then create + download a JSON key for it.
4. Save that JSON file somewhere this server can read, set
   `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` to its path.
5. In Google Calendar, open the target calendar's settings → "Share with
   specific people", add the service account's email (from the JSON key,
   looks like `...@...iam.gserviceaccount.com`) with "Make changes to
   events" permission.
6. Set `GOOGLE_CALENDAR_ID` to that calendar's ID (Settings → "Integrate
   calendar" → Calendar ID).

## Known v1 simplifications

- Slot times are naive local wall-clock values — this service assumes it's
  deployed in the same timezone as the physical resource being booked.
- Capacity is always created as 1 (the schema supports more, but nothing
  generates or books multi-capacity slots yet).
- Rescheduling shows all future open slots for the resource and does not
  re-enforce whatever minimum-notice rule (`after`) gated the original
  booking.
