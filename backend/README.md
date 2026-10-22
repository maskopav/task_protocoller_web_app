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


## Setup

### Install dependencies
```bash
cd backend
npm init -y
npm install mysql2 dotenv
```

---

## Upload management (phase B)

The desktop app's session uploads, device tracking, review API, downloads and backup. Specification:
[`docs/upload_management/specification.md`](../docs/upload_management/specification.md); API summary in
[`docs/newshare_changes.md`](../docs/newshare_changes.md); deployment in
[`docs/container_deployment.md`](../docs/container_deployment.md).

### Folder map

| Folder | Contents |
|---|---|
| `src/upload/` | `multipartReceiver` (streams the `zip` part to disk, hashes while writing), `ingestService` (idempotency, device/site resolution, commit), `validationQueue` (serial, re-enqueues `validating` rows at boot), `archiveValidator` and `zipReader` (checks without extracting), `sessionExtractor` (pure: metadata, flags, task results), `sessionAccess` (scoped session loading, audit), `csv`, `siteContext` |
| `src/storage/` | `fileStore.js`: `LocalFileStore` for `DATA_PATH` (`tmp/`, `sessions/<id[0:2]>/<sessionId>.zip`, atomic rename) |
| `src/backup/` | `BackupTarget` interface, `DirectoryBackupTarget`, `MemoryBackupTarget`, `MariaDbDumper`, `backupService`, `targetFactory`, and the shared contract suite `backupTargetContract.js` |
| `src/config/uploads.js` | Reads `DATA_PATH`, `UPLOAD_MAX_BYTES`, `BACKUP_*`. `ensureDataPath` runs at boot and stops the server if the path is not writable |
| `src/routes/` | `upload.js` (public `POST /upload`), `uploads.js` (list and review), `uploadDownloads.js` (ZIP, clips, bundle), `devices.js` |
| `src/controllers/` | `uploadController`, `downloadController`, `deviceController` |

`POST /upload` is mounted before the JSON parsers in `server.js`: its body is a multipart stream that only
`multipartReceiver` may read.

### npm scripts

| Script | Does |
|---|---|
| `npm run db:uploads` | Adds the phase B tables to an existing database (`CREATE TABLE IF NOT EXISTS`, no data loss). Needs `.env` |
| `npm run backup -- [db\|files\|all]` | `node src/runBackup.js`. Dumps the DB and copies new session ZIPs to `BACKUP_TARGET`. Exit 0 ok, 1 a run failed, 2 bad usage or target |
| `npm run db:test:reset` | Rebuilds the disposable test database (schema, upload tables, e2e seed) |

New `.env` keys: `DATA_PATH` (required), `UPLOAD_MAX_BYTES`, `BACKUP_TARGET`, `BACKUP_DB_KEEP`,
`BACKUP_DUMP_CMD`.

### Running the tests

```bash
cd backend && npm test        # vitest run: unit tests plus the integration tests below
```

- Unit tests need nothing else. Fixtures are built on the fly by `test/fixtures/buildSessionZip.js`.
- Integration tests (`test/integration/*.test.js`) use real MariaDB. They read `backend/.env.test`
  (git-ignored: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=task_protocoller_test`, `DATA_PATH`, ...)
  and roll back every test (`test/helpers/testDb.js`). If the database is unreachable they skip with a
  message.
- Local database: the Docker container used during development.

  ```bash
  docker run -d --name tp-mariadb -p 127.0.0.1:3306:3306 -v tp-mariadb-data:/var/lib/mysql \
    -e MARIADB_ROOT_PASSWORD=<password> mariadb:11.8
  # create the test database once, put the same credentials in .env.test, then:
  npm run db:test:reset
  ```

  `db:test:reset` drops every table in the `.env.test` database, so never point `.env.test` at a real one.
  The opt-in dumper test and local backup runs can use `BACKUP_DUMP_CMD="docker exec -i tp-mariadb mariadb-dump"`.
- E2E (Playwright, from `frontend/`) uses the same `.env.test`, with `DATA_PATH` under `backend/.data/`.
