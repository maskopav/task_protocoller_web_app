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