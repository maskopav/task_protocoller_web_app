# TaskProtocoller Web App

**TaskProtocoller** is a comprehensive, modular platform designed for research and clinical studies. Researchers design task protocols and manage projects in the web app; the protocols are performed at **sites** (clinics) by an external specialized desktop application, which fetches its configuration from this backend.



## Overview

The platform is built to define and distribute a wide range of assessments, including:
* **Speech & Voice**: Guided recording tasks such as phonation, repetition, reading, and retelling tasks.
* **Hearing & Auditory**: Digit to noise task.
* **Visual & Cognitive**: Farnsworth D-15 Dichotomous Test.
* **Motoric Testing**: 

### Why Use TaskProtocoller?
* **Consistency**: Standardized task wording and instructions across different studies and languages.
* **Flexibility**: Administrators can adjust specific task parameters (duration, phonemes, topics) without touching the code.
* **Transparency**: Configuration-driven and type-safe architecture ensures reproducible results.


## Key Features

### For Sites
* **Config by token**: Each site holds a unique access token; `GET /site-config/:token` returns every protocol the site inherits through its assigned projects, grouped by project, plus the site's free-form `config_json`.
* **Multi-project sites**: A site can participate in several projects at once — protocol inheritance is derived from the project links, never stored twice.
* **Multilingual Protocols**: Language variants (currently EN, CS, DE) are delivered side by side; the site app picks by language code.

### For Administrators
* **Protocol Designer**: Define task order, repetitions, and specific parameters like reading material or phonemes — with an in-browser protocol preview.
* **Site Management**: Create sites, copy their access tokens, assign projects, and edit site-level config JSON (master role).
* **Project Dashboard**: High-level overview of protocols and participating sites.

Details of the sites-based redesign (schema, API, what was removed) are in [`docs/newshare_changes.md`](docs/newshare_changes.md). The planned desktop-app upload flow is drafted in [`docs/desktop_upload_spec_draft.md`](docs/desktop_upload_spec_draft.md).

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

# Gmail Config For Sending emails
SMPT_HOST=smtp.gmail.com
SMTP_PORT=587
SMPT_USER=your_email@gmail.com
SMPT_PASS=your_google_app_password
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

## Testing

* **Backend unit tests**: `cd backend && npm test` (Vitest; DB access is mocked, no database needed).
* **Frontend unit tests**: `cd frontend && npm test` (Vitest).
* **End-to-end tests**: `cd frontend && npm run test:e2e` (Playwright). These boot the real backend against a disposable test database and need a `backend/.env.test` (gitignored) with:
  ```env
  DB_HOST=127.0.0.1
  DB_USER=root
  DB_PASSWORD=your_password
  DB_NAME=task_protocoller_test   # created manually; db:test:reset drops and reseeds it
  PORT=3001
  CORS_ORIGIN=https://localhost:5183
  JWT_SECRET=any_long_random_string
  ```

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