# Backend – TaskProtocoller Web App

This backend module initializes and manages the database for the **React Voice Recorder & Admin Task Editor** app.  
It connects to a MariaDB database and automatically runs SQL scripts to populate base tables (`task_types`, `tasks`).

---

## ⚙️ Project Overview

### Purpose
To automate database setup — so no manual import in phpMyAdmin is needed.

### Features
- Connects to MariaDB/MySQL automatically via Node.js
- Runs SQL scripts (e.g., inserting tasks)
- Uses environment variables for DB credentials
- Modular structure for adding more scripts later

---

## 📁 Structure

| Folder / File | Description |
|----------------|-------------|
| `scripts/initTasks.sql` | SQL script inserting base tasks and task types |
| `src/db/connection.js` | Creates and exports the database connection pool |
| `src/utils/runSqlFile.js` | Reads `.sql` files and executes them sequentially |
| `.env` | Stores DB credentials (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) |

```bash
backend/
├── scripts/
│   ├── schema/                # creation scripts only (tables, constraints)
│   │   ├── create_tables.sql
│   │   └── create_views.sql
│   ├── seed/                  # initial inserts only (lookup tables)
│   │   ├── insert_task_types.sql
│   │   ├── insert_languages.sql
│   │   ├── insert_tasks.sql
│   │   └── seed_all.sql       # imports all above
│   └── utils/
│       └── truncate_all.sql
│
├── src/
│   ├── app.js                 # initializes app, middleware, routes
│   ├── server.js              # starts the app (listens on PORT)
│   │
│   ├── db/
│   │   ├── connection.js      # MariaDB connection pool
│   │   └── queryHelper.js     # reusable query executor
│   │
│   ├── controllers/           # main business logic (matches frontend api)
│   │   ├── mappingController.js
│   │   ├── protocolController.js
│   │   └── genericController.js  # base class (optional, NOT IMPLEMENTED)
│   │
│   ├── routes/                # routers only (thin)
│   │   ├── mappings.js
│   │   ├── protocols.js
│   │   └── index.js           # exports all routers
│   │
│   ├── services/              # reusable logic not tied to express (NOT IMPLEMENTED YET)
│   │   ├── protocolService.js # (NOT IMPLEMENTED YET)
│   │   └── mappingService.js  # (NOT IMPLEMENTED YET)
│   │
│   ├── utils/
│   │   ├── runSqlFile.js
│   │   ├── fileUtils.js
│   │   └── logger.js
│   │
│   └── runInit.js             # runs all init SQLs (modular)
│
└── .env
```

## Timestamps: UTC stored, local displayed

One rule: **what's stored or machine-facing is UTC (DB timestamps, server filenames, logs); everything an admin reads is local time (admin UI, CSV exports).**

- **DB:** write every timestamp with `UTC_TIMESTAMP()`, explicitly in the INSERT/UPDATE. Never use `CURRENT_TIMESTAMP` or `NOW()`: the MySQL session runs in the server's local zone (`SYSTEM` = Europe/Prague), so those give local time. Column defaults in `create_tables.sql` are `DEFAULT (UTC_TIMESTAMP())`, but INSERTs still set the column explicitly, because a database that hasn't been migrated yet still has the old local-time defaults. `src/db/utcTimestamps.test.js` enforces both rules.
- **Filenames:** `dateInYyyyMmDdHhMmSs()`, e.g. `2026-08-31_13-38-47Z`. The trailing `Z` means UTC.
- **Logs:** `system_log.txt` entries are stamped `[2026-08-31T13:38:47.000Z]`. The admin log viewer also shows each entry's local time.
- **Admin UI:** DB strings are UTC. Convert with `frontend/src/utils/dateTime.js` (`parseUtcDbDateTime`, `formatUtcDbDate`). Never cut a timestamp with `.slice(0, 10)`, because that gives the UTC day.
- **CSV exports:** the session-data zip CSVs (`utcDbToLocal()` in `src/utils/dateFormatter.js`), the Fieldwork CSV and the bookings CSV all write local time. Only the filenames (zip, audio) stay UTC with `Z`.

Values that are already local, and are shown and stored as-is:
- **Wall-clock values**, i.e. when something happens rather than when it was saved: `participant_protocol_contacts.contacted_at` (the agency's local time from the Fieldwork CSV import) and booking-service `slots.starts_at/ends_at` (the room's local time).
- **Calendar dates** (`DATE` columns): `projects.start_date/end_date`, `birth_date`, the booking eligibility date. They're set with `localDateString()`, so a project created at 00:30 starts "today", not yesterday.

**Server-side "local"** means the Node process's time zone, which booking-service's slot logic already relies on. If the production host runs in UTC, start the app with `TZ=Europe/Prague`. You can check with `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`.

Rows saved before 2026-09-30 that relied on a column default (e.g. `session_mic_checks.created_at`, `participants.created_at`, `users.created_at`) hold Prague local time rather than UTC. They were left as they are on purpose.

### Updating an existing database

A fresh install (`runInit.js`) already gets the UTC defaults. For a database created before 2026-09-30, run once:

1. Check the server version (`SELECT VERSION();`). It needs MariaDB ≥ 10.2.1 or MySQL ≥ 8.0.13.
2. Optional, for production: `node scripts/schema/compareSchemas.js .env .env.production` to catch drift first.
3. Run `scripts/utils/utc_timestamp_defaults.sql` against the app DB, and `booking-service/scripts/utils/utc_timestamp_defaults.sql` against the DB holding the booking tables.

It changes column defaults only; no rows are touched. It's safe to re-run. The app is correct with or without it, so there's no deploy ordering to worry about.


## Setup

### Install dependencies
```bash
cd backend
npm init -y
npm install mysql2 dotenv
```
