# TaskProtocoller Web App

**TaskProtocoller** is a comprehensive, modular platform designed for research and clinical studies. It serves a dual purpose: providing a standardized testing interface for participants and a robust management suite for researchers.



## Overview

The platform is built to facilitate a wide range of assessments, including:
* **Speech & Voice**: Guided recording tasks such as phonation, repetition, reading, and retelling tasks.
* **Hearing & Auditory**: Digit to noise task.
* **Visual & Cognitive**: Farnsworth D-15 Dichotomous Test.
* **Motoric Testing**: 

### Why Use TaskProtocoller?
* **Consistency**: Standardized task wording and instructions across different studies and languages.
* **Flexibility**: Administrators can adjust specific task parameters (duration, phonemes, topics) without touching the code.
* **Transparency**: Configuration-driven and type-safe architecture ensures reproducible results.


## Key Features

### 🙋‍♂️ For Participants 
* **Guided Interface**: Step-by-step instructions for performing cognitive and voice tasks.
* **Multilingual Support**: Supports dynamic translations (currently EN, CS, DE) to ensure clarity for all users.
* **Interactive Tools**: Real-time audio visualizers and automated recording modes (countdowns, manual stops).

### 🧑‍💼 For Administrators
* **Protocol Designer**: Define task order, repetitions, and specific parameters like reading material or phonemes.
* **Participant Management**: Generate unique tokens, assign protocols to specific participants, and track progress.
* **Project Dashboard**: High-level overview of study statistics and protocol versions.

---

## Quick Start (Local Development)

To run the full-stack application locally, follow these steps:

### 1. Prerequisites
Ensure you have the following installed:
* **Node.js** (v18.x or higher) + **npm** (v9.x or higher) 
    - Download from official site [https://nodejs.org/](https://nodejs.org/), both Node.js and npm will be downloaded
    - To check instalation run:
    ```cmd
    node -v
    npm -v
    ```
* **MariaDB** or **MySQL** server

### 2. Database Setup
#### A. Add MariaDB to your System PATH (Windows)
0. Check if the MariaDB is running as a background service: Press `Win + R`,type `services.msc`, and press Ente -> Look for MariaDB or MySQL in the list -> If the status is not "Running," right-click it and select Start.
1. Search for "Edit the system environment variables" in Start.
2. Click Environment Variables.
3. Under User variables, find Path, click Edit, then click New.
4. Paste the path to your bin folder (e.g., `C:\Program Files\MariaDB 12.1\bin`).
5. Restart your terminal.

#### B. Create the Database
Log into your database and create the schema manually before running the app:
```bash
mysql -u root -p
# Inside the MariaDB prompt:
CREATE DATABASE task_protocoller;
EXIT;
```
#### C. Configure Environment
Navigate to the `backend` folder and create a `.env` file based on your credentials:
```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=db_name
PORT=3000
VITE_API_BASE=http://localhost:3000/api
DATA_PATH=./uploads
I18N_PATH=./locales

# Signing key for admin JWTs — any long random string - e.g.
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your_random_secret
JWT_EXPIRES_IN=8h

# Browser origins allowed to read API responses (comma-separated). Defaults to
# https://localhost:5173,https://localhost:5183 (Vite's dev ports) if unset.
CORS_ORIGIN=https://localhost:5173

# Gmail Config For Sending emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_google_app_password
```

#### Note on Gmail Configuration
 You must use a 16-character App Password from your Google Account settings (not your regular password) to send tokens/emails.

### 3. Initialize Backend

To log in for the first time, you need a password hash for the Master user in the database and initialization of dependencies and mapping tables.

1. **Generate a Hash**: Set the password in `hash_gen.js` and run `node backend/hash_gen.js` to get hashed password instead. 
2. **Update Artificial Data**: Open `backend/scripts/seed/artificial_data.sql` and replace `$2b$10$GENERATED_HASH_HERE` with the hash you just generated.
3. **Initialize**: Run these commands to install dependencies and automatically build your database tables and push this user into DB:
```bash
cd backend
npm install
node src/runInit.js
```

### 4. Start the Application
You need to run both the server and the interface at the same time. Open two separate terminal windows:

Terminal 1 (Backend Server)
```bash
cd backend
node server.js
```
Terminal 2 (Frontend Interface)
```bash
cd frontend
npm install # can be run only once
npm run dev
```
The application will now be live at: `http://localhost:5173`. Ignore the warning net::ERR_CERT_AUTHORITY_INVALID that your connection is not private, click on broader setting and click on continue to web localhost...

---

## Database verification
To check if your database was initialized correctly, use your terminal to log into the MariaDB/MySQL monitor:
1. Login
```bash
mysql -u root -p  # (Enter your password when prompted)
```
2. Check Tables: Run these commands inside the MySQL prompt:
```SQL
USE 'db_name';
-- Normal SQL commands can be used as:
SHOW TABLES;            -- Should list tasks, users, protocols, etc.
SELECT * FROM tasks;    -- Should show pre-seeded study tasks
```

---

## 📁 Technical Documentation
For more detailed technical information, please refer to the specific READMEs in each module:
- **Backend Documentation**: Detailed database schema, API structure, and SQL script management.

- **Frontend Documentation**: Information on the Task Factory, i18n implementation, and React Context architecture.

---

## 📅 Follow-up Booking Integration (optional)

For pilots that need respondents to return for an in-person retest (e.g. a
standardized-room session, gated to at least N days after completing the
remote protocol), this app integrates with **[`booking-service`](booking-service/README.md)** —
a separate, standalone appointment-booking service in this same repo. It has
no knowledge of protocols/participants; the two talk to each other only
through `backend/src/services/bookingServiceClient.js`.

**How it fits together:**
- `booking-service/` owns availability, the actual reservation flow (its own
  hosted, self-contained booking/manage pages), emails, and optional Google
  Calendar sync. Set it up first — see its own README, including the
  Google Calendar walkthrough.
- This app's backend never talks to booking-service's database directly —
  only its HTTP API, using a per-deployment API key + link-signing secret
  (see below).
- A protocol only gets the booking step if its editor has **Follow-up
  Appointment Booking** checked (`ProtocolEditor` → same place as the Audio
  Instructions toggle). It then appears as the very last step, after every
  real task — the participant picks a slot in an embedded booking-service
  page, gets a confirmation email, and can reschedule/cancel from a link in
  that email up to a day before the appointment.
- Admins manage slots and see reservations from **Admin Dashboard → Master
  Tools → Follow-up Booking Slots** (`/admin/booking-slots`) — a form to
  bulk-generate availability and a table of reservations with CSV export.
  This proxies to booking-service's admin API server-side, so no separate
  login or API key is ever exposed to the browser.

**Setup**, once `booking-service` itself is running (locally or deployed):

1. From `booking-service/`, run `npm run tenant:create -- "Task Protocoller"`
   and copy the three printed values.
2. Add to `backend/.env`:
   ```env
   BOOKING_SERVICE_URL=http://localhost:4100
   BOOKING_SERVICE_TENANT_ID=<from tenant:create>
   BOOKING_SERVICE_API_KEY=<from tenant:create>
   BOOKING_SERVICE_LINK_SIGNING_SECRET=<from tenant:create>
   # Optional — all have sensible defaults:
   # BOOKING_SERVICE_RESOURCE_SLUG=standardized-room-retest
   # BOOKING_SERVICE_RESOURCE_NAME=Standardized Room Retest
   # BOOKING_SERVICE_DEFAULT_DURATION_MIN=45
   # BOOKING_SERVICE_DEFAULT_LOCATION=Room 2B
   ```
   (The bookable resource itself is created automatically on first use of
   the admin UI/API — no manual step needed beyond the env vars above.)
3. Restart the backend. Enable the checkbox on whichever protocol(s) need
   the follow-up step, generate some slots from the new admin page, and
   you're done — nothing else in the app needs to change.

### Deploying where a second app/port/DNS entry isn't possible

For hosting reachable only via SFTP with no way to register a second
Node app/port (the common case on shared/managed hosting panels):
`backend/server.js` can run booking-service as a sub-app of its own
process at `/booking-service`, instead of as its own separate process.

1. **Locally**, install both apps' dependencies (the server can't run
   `npm install` itself, so `node_modules` has to be part of what you
   upload):
   ```
   cd backend && npm install
   cd ../booking-service && npm install
   ```
2. **Create the production database** for booking-service (a second
   database on the same MySQL server as the main app is simplest — nothing
   is shared/joined between them):
   ```sql
   CREATE DATABASE booking_service;
   ```
   then, still pointed at it, run `npm run db:init` from `booking-service/`
   (or apply `booking-service/scripts/schema/create_tables.sql` by hand).
3. **Create the production tenant** — from `booking-service/`, with its
   `.env` pointed at the production DB:
   ```
   npm run tenant:create -- "Task Protocoller Production"
   ```
   Copy the three printed values; they're shown once.
4. **Upload** `backend/` and `booking-service/` as sibling folders (matching
   the relative import path `../booking-service/src/app.js` that
   `server.js` uses), including each one's `node_modules`. Also upload the
   Google service-account JSON key file (see
   `booking-service/README.md`'s Calendar section) somewhere the server can
   read it.
5. **Set these in the production `backend/.env`** (nothing needed in a
   separate `booking-service/.env` — mounted mode reads everything from
   this one shared file):
   ```env
   MOUNT_BOOKING_SERVICE=true

   # booking-service's own config (normally its own .env; merged in here
   # because mounted mode runs inside this same process)
   BOOKING_DB_NAME=booking_service   # NOT the same var as this app's own DB_NAME — see the note below
   PUBLIC_BASE_URL=https://your-domain.com/booking-service
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=...
   SMTP_PASS=...
   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/absolute/path/on/server/to/key.json
   GOOGLE_CALENDAR_ID=...

   # this app's own client of booking-service, from step 3 above
   BOOKING_SERVICE_URL=https://your-domain.com/booking-service
   BOOKING_SERVICE_TENANT_ID=...
   BOOKING_SERVICE_API_KEY=...
   BOOKING_SERVICE_LINK_SIGNING_SECRET=...
   ```
   `BOOKING_DB_NAME` (not `DB_NAME`) matters here specifically because this
   app's own `.env` already defines `DB_NAME` for its own database, and
   mounted mode runs both apps in one shared process — `DB_HOST`/`DB_USER`/
   `DB_PASSWORD` are meant to be identical (same server, shared
   credentials), but `DB_NAME` is not, since it names two different
   databases. See `booking-service/README.md`'s "Running mounted inside
   another process" for more.
6. **Restart** the backend process (however your host's panel/Passenger
   does that — commonly touching a restart file).
7. **Verify**: `https://your-domain.com/booking-service/health` should
   return `{"status":"ok"}`. Then enable "Follow-up Appointment Booking" on
   a protocol, generate a few slots from **Admin Dashboard → Master Tools →
   Follow-up Booking Slots**, and run through one real booking end to end.

---

## 🛠 Troubleshooting
### "scripts are disabled on this system" (PowerShell Error)
If you see a `SecurityError` or `UnauthorizedAccess` when running `npm install`, PowerShell is blocking the script. To fix it:
1. Open PowerShell as Administrator.
2. Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
3. Type Y and press Enter.

### Database Not Found
Ensure the `DB_NAME` in your `.env` matches the name you used in the `CREATE DATABASE` command. You can verify your tables by running:
```SQL
USE task_protocoller;
SHOW TABLES;
```