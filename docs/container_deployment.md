# Deploying to the test container (`share_web`)

How to deploy this app to the test container at `192.168.122.183`, written for
people and for coding agents. The first two sections cover a routine redeploy.
The rest covers first-time setup, resetting the database and troubleshooting.

## Target at a glance

| | |
|---|---|
| SSH | `ssh share_web` (`~/.ssh/config`: `HostName 192.168.122.183`, `Port 10000`, `User root`, `IdentityFile ~/.ssh/id_ed25519`) |
| Public URL | `http://192.168.122.183:10001` (VM port 10001 → container port 80), also reverse-proxied at `https://malenia.feld.cvut.cz/koubic/` (prefix stripped; `CORS_ORIGIN` must list both origins) |
| OS | Ubuntu 26.04 LXC container (systemd), x86_64 |
| App root | `/opt/task-protocoller/` — `backend/`, `frontend/` (built SPA), `locales/` (i18n JSON) |
| Backend | systemd unit `task-protocoller` — `node server.js` on port 3000, user `taskprot`, `NODE_ENV=production` |
| Web server | nginx on :80 — serves `frontend/`, forwards `/api/` → `127.0.0.1:3000/` (strips `/api`) |
| Database | MariaDB 11.8 (local), database `task_protocoller`, DB user `taskprot@localhost` |
| Config | `/opt/task-protocoller/backend/.env` (mode 600, owner `taskprot`) |
| Logs | `journalctl -u task-protocoller`, app log `/opt/task-protocoller/backend/logs/system_log.txt` |
| Test logins | `master@test.com` / `1234`, `admin@test.com` / `1234` (from `backend/scripts/seed/artificial_data.sql`) |

Ports 10000 and 10001 are forwarded by the VM, not by the container. Nothing
else is reachable from outside.

## Before you start: VPN MTU

The route from a laptop to `192.168.122.183` goes through the VPN (`utun*` on
macOS), which only carries packets up to **1400 bytes** but reports 1500.
Oversized packets are dropped silently. Small commands work, but anything that
sends back more than about 1.3 KB (rsync, `ps`, the 3 MB frontend bundle in a
browser) hangs until it times out ("Timeout, server not responding").

Check the MTU and fix it if needed. The setting resets whenever the VPN reconnects:

```bash
route -n get 192.168.122.183 | grep interface      # e.g. utun4
ifconfig utun4 | grep -o 'mtu [0-9]*'               # needs to be 1400
sudo ifconfig utun4 mtu 1400                        # a human has to run this (sudo)

# Quick test: must print 200000
ssh share_web 'head -c 200000 /dev/urandom' | wc -c
```

Changing the container's own MTU does **not** help, because the VM forwards
port 10000 through a proxy. For a permanent fix, set the MTU in the VPN client,
or clamp the TCP MSS on the VM or VPN server.

## Routine redeploy (code changes only)

Run from the repo root on your machine. This keeps the database and `.env`.

```bash
# 1. Tests
(cd backend && npm ci && npx vitest run)

# 2. Build the frontend. `vite build` reads frontend/.env.production
#    (VITE_API_BASE=./api, VITE_APP_BASE_PATH=./). The paths are relative so the
#    same build works directly on :10001 and behind the reverse proxy at
#    https://malenia.feld.cvut.cz/koubic/.
(cd frontend && npm ci && npm run build)

# 3. Upload. Keep these excludes: they protect the server's .env, logs and
#    installed node_modules. (No rsync, e.g. Git Bash on Windows? See the tar
#    variant below.)
S="ssh -o BatchMode=yes -o ServerAliveInterval=10"
rsync -az --delete -e "$S" --exclude node_modules --exclude logs --exclude '.env*' --exclude uploads --exclude .data \
  backend/ share_web:/opt/task-protocoller/backend/
rsync -az --delete -e "$S" frontend/dist/ share_web:/opt/task-protocoller/frontend/
rsync -az --delete -e "$S" frontend/src/i18n/ share_web:/opt/task-protocoller/locales/

# 4. Install deps (only needed when package-lock.json changed, harmless otherwise),
#    fix ownership, restart
ssh share_web 'cd /opt/task-protocoller/backend && npm ci --omit=dev >/tmp/npm_ci.log 2>&1 || tail -20 /tmp/npm_ci.log;
  chown -R taskprot:taskprot /opt/task-protocoller && systemctl restart task-protocoller && sleep 2 &&
  systemctl is-active task-protocoller && journalctl -u task-protocoller -n 5 --no-pager -o cat'
```

The schema is not migrated: when it changes, the database is recreated from `create_tables.sql`,
`create_views.sql` and the seeds with `runInit.js` (existing data is discarded). There is no
`db:permissions` step any more.

Without rsync, ship exactly the git-tracked backend files with tar. Build the archive **first**
and only clear the server side once it exists. `--force-local` stops GNU tar from reading `C:` in a
Windows path as a remote host:

```bash
(cd backend && git ls-files | tar --force-local -czf /tmp/backend.tgz -T -) && (cd frontend/dist && tar --force-local -czf /tmp/frontend.tgz .) && (cd frontend/src/i18n && tar --force-local -czf /tmp/locales.tgz .) && ssh share_web 'cd /opt/task-protocoller/backend && find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name logs ! -name ".env*" -exec rm -rf {} +' && ssh share_web 'tar xzf - -C /opt/task-protocoller/backend' < /tmp/backend.tgz && ssh share_web 'rm -rf /opt/task-protocoller/frontend/* && tar xzf - -C /opt/task-protocoller/frontend' < /tmp/frontend.tgz && ssh share_web 'rm -rf /opt/task-protocoller/locales/* && tar xzf - -C /opt/task-protocoller/locales' < /tmp/locales.tgz
```

Then continue with step 4.

Phase B (upload management) adds more steps on first deploy: see
[Phase B: upload management](#phase-b-upload-management). Then run the checks under
[Verify](#verify).

**Never let `--delete` reach `DATA_PATH`.** Uploaded session ZIPs are the only copy until the
backup has run. The recommended `DATA_PATH` (`/srv/task-protocoller/data`) is outside the rsync
target. If you put it inside `backend/` (for example `backend/.data`), keep the `--exclude .data`
above (or the matching name). Never rsync *to* a path that contains `DATA_PATH`, and never run
`chown -R` or `rm -r` over it by accident (the step-4 `chown -R` covers `/opt/task-protocoller`,
which is only safe if `DATA_PATH` is outside it or already owned by `taskprot`).

## Verify

```bash
B=http://192.168.122.183:10001
curl -s -o /dev/null -w "index %{http_code}\n" $B/
TOKEN=$(curl -s -X POST $B/api/auth/admin/login -H "Origin: $B" -H 'content-type: application/json' \
  -d '{"email":"master@test.com","password":"1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" $B/api/projects/projects-list | python3 -c 'import sys,json;print(len(json.load(sys.stdin)),"projects")'
curl -s -o /dev/null -w "site-config %{http_code}\n" $B/api/site-config/paris000paris000paris000paris000
# Security regressions. Expected: 401, then 400.
curl -s -o /dev/null -w "setup-profile w/o auth %{http_code}\n" -X POST $B/api/auth/setup-profile \
  -H "Origin: $B" -H 'content-type: application/json' -d '{"userId":1,"password":"x1234567"}'
curl -s -o /dev/null -w "reset object token %{http_code}\n" -X POST $B/api/auth/admin/reset-password \
  -H "Origin: $B" -H 'content-type: application/json' -d '{"token":{"reset_password_token":1},"password":"x1234567"}'
```

Browser requests always send an `Origin` header on POST. If it isn't listed in
`CORS_ORIGIN`, the API answers 403 "Not allowed by CORS", so include it in
curl tests as well.

## Reset the database (destroys all data)

`src/runInit.js` **drops every table**, recreates the schema and views, and
loads the lookup data plus the artificial test data (including the test logins
above). Only run it if the person you're working for has asked for it.

```bash
ssh share_web 'cd /opt/task-protocoller/backend && systemctl stop task-protocoller &&
  sudo -u taskprot node src/runInit.js 2>&1 | grep -v "^Executing" | tail -5 &&
  systemctl start task-protocoller'
```

`runInit.js` and `runE2ESeed.js` exit immediately if `NODE_ENV=production`.
The service sets that variable, but an interactive shell doesn't, so the
commands above work. Never export it to get around the guard, and never point
these scripts at a real database.

## First-time setup on a fresh container

This is what was done on 2026-09-27. Repeat it only for a new container.

### 1. Packages and user

```bash
ssh share_web 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq &&
  apt-get install -y -qq nodejs npm nginx build-essential python3 mariadb-server'
ssh share_web 'id taskprot || useradd --system --home /opt/task-protocoller --shell /usr/sbin/nologin taskprot;
  mkdir -p /opt/task-protocoller/{backend,frontend,locales}'
```

Ubuntu's `npm` package pulls in several hundred `node-*` packages, so the install takes 10–15 minutes.

### 2. Upload

Build and rsync as in [Routine redeploy](#routine-redeploy-code-changes-only)
steps 2–3, then run `npm ci --omit=dev` in `/opt/task-protocoller/backend`.

### 3. Database and `.env`

Secrets are generated **on the container** and never printed. Don't copy them
into chat logs, commits or docs.

```bash
ssh share_web 'set -e; cd /opt/task-protocoller/backend
DBPW=$(openssl rand -hex 24); JWT=$(openssl rand -hex 48)
mariadb -e "CREATE DATABASE IF NOT EXISTS task_protocoller CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS \`taskprot\`@\`localhost\` IDENTIFIED BY \"$DBPW\";
  ALTER USER \`taskprot\`@\`localhost\` IDENTIFIED BY \"$DBPW\";
  GRANT ALL PRIVILEGES ON task_protocoller.* TO \`taskprot\`@\`localhost\`; FLUSH PRIVILEGES;"
umask 077; cat > .env <<EOF
DB_HOST=127.0.0.1
DB_USER=taskprot
DB_PASSWORD=$DBPW
DB_NAME=task_protocoller
PORT=3000
I18N_PATH=/opt/task-protocoller/locales
ASSET_BASE_URL=http://192.168.122.183:10001
FRONTEND_BASE_URL=http://192.168.122.183:10001
CORS_ORIGIN=http://192.168.122.183:10001
JWT_SECRET=$JWT
JWT_EXPIRES_IN=8h
DATA_PATH=/srv/task-protocoller/data
UPLOAD_MAX_BYTES=4294967296
EOF
mkdir -p logs /srv/task-protocoller/data; chown -R taskprot:taskprot /opt/task-protocoller /srv/task-protocoller/data
sudo -u taskprot node src/runInit.js 2>&1 | tail -3'
```

The server refuses to start without `JWT_SECRET` or `FRONTEND_BASE_URL`, which
is used for the links in password-reset and welcome emails. SMTP isn't
configured, so those emails fail and the failure is logged. To enable email,
add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS`. TLS certificate
checking is enforced: STARTTLS on any port except 465, which uses direct TLS.

### 4. systemd unit — `/etc/systemd/system/task-protocoller.service`

```ini
[Unit]
Description=TaskProtocoller backend (Express API)
After=network-online.target mariadb.service
Wants=network-online.target
Requires=mariadb.service

[Service]
Type=simple
User=taskprot
Group=taskprot
WorkingDirectory=/opt/task-protocoller/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/task-protocoller/backend/logs /srv/task-protocoller/data

[Install]
WantedBy=multi-user.target
```

`ProtectSystem=strict` leaves the filesystem read-only for the app except for
`logs/` and `DATA_PATH` (uploads). If a feature later needs to write somewhere
else, add that path to `ReadWritePaths`. The path must exist when the unit
starts, otherwise systemd fails the namespace setup (exit 226/NAMESPACE).

### 5. nginx site — `/etc/nginx/sites-available/task-protocoller`

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    server_tokens off;
    access_log /var/log/nginx/access.log noquery;   # Phase B, see "Keep ?ticket= out of access logs"

    root /opt/task-protocoller/frontend;
    index index.html;

    # Backend routes are mounted at the root (/auth, /sites, ...); /api is
    # stripped here, matching VITE_API_BASE=/api in the frontend build.
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Overwrite, not append: the app trusts exactly one proxy hop.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 6m;
    }

    # Phase B: desktop app session upload (up to 4 GiB). Must come before
    # /api/. See "Phase B: upload management" for what each line is for.
    location = /api/upload {
        proxy_pass http://127.0.0.1:3000/upload;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 4g;
        proxy_request_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Phase B: ZIP, clip and bundle downloads stream large bodies. No trailing
    # slash: with "/api/uploads/" nginx answers the list call GET /api/uploads?…
    # with a 301 redirect to /api/uploads/.
    location /api/uploads {
        proxy_pass http://127.0.0.1:3000/uploads;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 600s;
        client_max_body_size 6m;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ssh share_web 'rm -f /etc/nginx/sites-enabled/default &&
  ln -sf /etc/nginx/sites-available/task-protocoller /etc/nginx/sites-enabled/ &&
  nginx -t && systemctl daemon-reload && systemctl enable --now task-protocoller && systemctl reload nginx'
```

The backend has `app.set("trust proxy", 1)` hard-coded (see `backend/server.js`)
because exactly one proxy, this nginx, sits in front of it. If you add another
proxy layer, change that setting too. Otherwise the rate limiters either count
every client as the same one or can be bypassed with a spoofed
`X-Forwarded-For`.

## Phase B: upload management

What a deploy of the upload feature needs on top of a routine redeploy. Do these in order. The
backend refuses to start without `DATA_PATH`, so the `.env` and directory steps come first.

### 1. `.env` keys

Add to `/opt/task-protocoller/backend/.env` (mode 600, owner `taskprot`; edit it on the container,
never print it):

```
DATA_PATH=/srv/task-protocoller/data      # required; one filesystem (atomic rename tmp -> sessions)
UPLOAD_MAX_BYTES=4294967296               # optional, default 4 GiB
QUARANTINE_MAX_BYTES=21474836480          # optional, default 20 GiB: total stored for unregistered devices
QUARANTINE_MAX_PER_DEVICE=50              # optional: quarantined sessions per unregistered device
MIN_FREE_BYTES=5368709120                 # optional, default 5 GiB: below this free space every upload gets 507
BACKUP_TARGET=dir:/mnt/backup/task-protocoller   # see "Backups"; only the backup job needs it
BACKUP_DB_KEEP=14                         # optional
BACKUP_DUMP_CMD=                          # optional, default "mariadb-dump"
```

### 2. Create `DATA_PATH`

```bash
ssh share_web 'install -d -o taskprot -g taskprot -m 750 /srv/task-protocoller/data'
```

The server creates `tmp/` and `sessions/` inside it at boot, but it can't create the parent, and
it exits if the directory is not writable by `taskprot`. Don't put it under
`/opt/task-protocoller/backend` unless the rsync excludes cover it.

### 3. systemd

Add the path to `ReadWritePaths=` in `task-protocoller.service` (see the unit above), then:

```bash
ssh share_web 'systemctl daemon-reload && systemctl restart task-protocoller'
```

The backup service needs its own `ReadWritePaths` for the backup mount (see "Backups").

### 4. nginx

Use the two extra `location` blocks from the site file above, then `nginx -t && systemctl reload nginx`.

| Setting | Why |
|---|---|
| `location = /api/upload` | Separate from `/api/`, which caps bodies at 6m |
| `client_max_body_size 4g` | Matches the default `UPLOAD_MAX_BYTES`. Raise both if you raise the limit. Without it nginx answers 413 before the app sees the request |
| `proxy_request_buffering off` | Streams the body to the app instead of spooling GBs into nginx's temp dir |
| `proxy_read_timeout` / `proxy_send_timeout 600s` | Large uploads over slow clinic links |
| `proxy_buffering off` on `/api/uploads` (no trailing slash, or the list call gets a 301) | Streams ZIPs, clips and bundles instead of buffering them on disk |

**Keep `?ticket=` out of access logs.** Download tickets (5 min, download routes only) travel in the
query string of `GET /uploads/:id/zip` and `/clips/...`. The default nginx `combined` format logs the
full request line. A ticket can't act as a session or mint another one, but it can fetch whatever
that admin may download until it expires, so don't keep it. Log the path without the query string:

```nginx
# in the http {} block (e.g. /etc/nginx/conf.d/log_noquery.conf)
log_format noquery '$remote_addr - [$time_local] "$request_method $uri $server_protocol" '
                   '$status $body_bytes_sent "$http_user_agent"';
# in the server {} block
access_log /var/log/nginx/access.log noquery;
```

If you keep the default format, treat the access log as sensitive and rotate it quickly. The bundle
download is a POST form, so its ticket is in the body, not the URL. Any reverse proxy in front
(`malenia`) has its own logs and the same risk.

### 5. Database

For an existing database, add the six new tables without touching data:

```bash
ssh share_web 'cd /opt/task-protocoller/backend && sudo -u taskprot npm run db:uploads'
```

It runs `scripts/schema/create_upload_tables.sql` (`CREATE TABLE IF NOT EXISTS`), so re-running is
harmless. A fresh install gets the tables from `runInit.js`.

### 6. Verify the upload path

`B` and `TOKEN` as in [Verify](#verify). The site token is the seeded Paris test token. The fixture
ZIP is built on your machine from the repo's test builder (it needs no database):

```bash
# Build a valid fixture ZIP locally; prints path, sessionId, sha256
(cd backend && node -e '
import("./test/fixtures/buildSessionZip.js").then(({buildSessionZip}) => {
  const r = buildSessionZip({ variant: "valid" });
  console.log(JSON.stringify({ path: r.path, sessionId: r.sessionId, sha256: r.sha256, installationId: r.installationId }));
});' > /tmp/fixture.json)
F=$(python3 -c 'import json;print(json.load(open("/tmp/fixture.json"))["path"])')
SID=$(python3 -c 'import json;print(json.load(open("/tmp/fixture.json"))["sessionId"])')
SHA=$(python3 -c 'import json;print(json.load(open("/tmp/fixture.json"))["sha256"])')
IID=$(python3 -c 'import json;print(json.load(open("/tmp/fixture.json"))["installationId"])')

# 1. Upload (text parts first, zip last). Expect 200 {"status":"ok",...}
curl -s -w "\nupload %{http_code}\n" $B/api/upload \
  -F installationId=$IID -F sessionId=$SID -F zipSha256=$SHA \
  -F siteToken=paris000paris000paris000paris000 -F appVersion=0.0-verify -F "zip=@$F;type=application/zip"

# 2. Same request again: still 200 (idempotent re-send). With different bytes it would be 409.

# 3. As master: the session is listed and turns valid after a moment
sleep 3
curl -s -H "Authorization: Bearer $TOKEN" "$B/api/uploads?q=${SID:0:8}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["total"],[ (r["id"][:8],r["status"]) for r in d["rows"]])'

# 4. Ticket and download. Expect 200 and the first bytes "PK"
T=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" $B/api/uploads/ticket | python3 -c 'import sys,json;print(json.load(sys.stdin)["ticket"])')
curl -s -o /tmp/dl.zip -w "download %{http_code} %{size_download} bytes\n" "$B/api/uploads/$SID/zip?ticket=$T"
head -c 2 /tmp/dl.zip; echo
# A ticket must not work as a session: expect 401
curl -s -o /dev/null -w "ticket as session %{http_code}\n" -H "Authorization: Bearer $T" $B/api/uploads
```

Expected: `upload 200`, `1 [('<id>', 'valid')]` (the fixture's project and protocol names don't
match the seed data, so the row has no project, which is allowed), `download 200`, `PK`, `401`. Also
check `ls /srv/task-protocoller/data/sessions/*/` on the container, the `device` row in the UI under
`/admin/uploads/devices`, and that `grep ticket= /var/log/nginx/access.log` finds nothing if you
applied the log format above. The original upload filename is never stored or logged. Leave the
fixture session in place or ask before removing it (there is no delete feature; it is the only
copy of its bytes).

Then run `node src/runBackup.js all` as `taskprot` (or start the timer) once `BACKUP_TARGET` is
mounted and check `backup_runs`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| ssh/rsync hangs, "Timeout, server not responding"; browser loads the page but never the JS | VPN MTU, see [Before you start](#before-you-start-vpn-mtu) |
| `Load key ... bad permissions` | `chmod 600 ~/.ssh/id_ed25519` |
| Service keeps restarting, `JWT_SECRET is not set` / `FRONTEND_BASE_URL is not set` | `.env` is missing or wasn't readable by `taskprot` (check owner and mode 600) |
| 502 from nginx | Backend is down: `journalctl -u task-protocoller -n 50 --no-pager` |
| 403 "Not allowed by CORS" | The request's `Origin` isn't in `CORS_ORIGIN` in `.env` |
| 429 on login or `/site-config` | Rate limit (10 logins or 20 failed site-config lookups per 15 min per client IP). `systemctl restart task-protocoller` clears it (the counters are in memory) |
| Every request is 401 after upgrading | The token no longer matches the account's `token_version` (it goes up on every password change). Log in again |
| `Unknown column ...` or `Table ... doesn't exist` | Old schema: recreate the database with `runInit.js` (the schema is not migrated) |
| `Table 'upload_sessions' doesn't exist` or similar after deploying phase B | Run `npm run db:uploads` (see below) |
| Upload from the desktop app fails with 413 from nginx (HTML body, not JSON) | `client_max_body_size` on `/api/upload` is missing or too small (the generic `/api/` has 6m). Add the `location = /api/upload` block, `nginx -t`, reload. Also check any reverse proxy in front (the `malenia` one) |
| Upload hangs, then 502/504 | `proxy_request_buffering off`, `proxy_read_timeout`/`proxy_send_timeout 600s` missing, or the client link is too slow for 600 s |
| Service exits at boot with `DATA_PATH is not set`, or `EACCES`/`EROFS` on `DATA_PATH` | Key missing from `.env`, directory not owned by `taskprot`, or the path is not in `ReadWritePaths`. Check `ls -ld $DATA_PATH` and `systemctl cat task-protocoller`. Unit exit 226/NAMESPACE means the `ReadWritePaths` directory doesn't exist yet |
| Sessions stay `validating` | Validation runs in-process after the response. Look in `journalctl -u task-protocoller` for errors. A restart re-enqueues every `validating` row at boot. A session that never leaves the state usually means the validator crashed on that ZIP, or `DATA_PATH` was replaced and the file is missing |
| Bundle download in the browser gives 403 "Not allowed by CORS" | The bundle is a native form POST with `Origin: null` and no `Authorization` header. Only `POST /uploads/download` is exempt. Check that the backend is current and that the proxy forwards the path unchanged (`/api/uploads/download` to `/uploads/download`). A `fetch` with a header gets the normal CORS check |
| Download or clip play returns 401 | The ticket expired (5 min) or the account's `token_version` changed. Reload the page to get a new one |
| Disk fills up under `DATA_PATH/tmp` | Interrupted uploads are normally deleted. Leftover `*.part` files from a crash are safe to remove while no upload is running |

## Rules for agents

- Use `ssh -o BatchMode=yes share_web '...'` and keep the output small: pipe
  through `tail`/`head`, and save long logs to files on the container.
- Never print `.env`, the DB password or `JWT_SECRET`, and never copy them anywhere.
- Look before you delete, and ask before any destructive step: `runInit.js`,
  dropping databases, or removing services or directories.
- The `phpmyadmin` database in MariaDB belongs to someone else. Leave it alone.
- Before this app was deployed, the container ran a Python mock server
  (`share-mock-server.service`). It was removed on 2026-09-27; its backup is
  `/root/share-mock-server-backup-20260927.tgz`. Don't delete the backup without asking.

## Backups

`node src/runBackup.js [db|files|all]` (also `npm run backup`) writes two kinds of backup
to a pluggable target and records every run in the `backup_runs` table:

- **db**: `mariadb-dump --single-transaction --routines --triggers`, gzip'd to
  `db/<UTC yyyymmdd-HHMMss>.sql.gz`. The newest `BACKUP_DB_KEEP` dumps are kept, older ones removed.
- **files**: every session ZIP not yet backed up (`upload_sessions.backed_up_at IS NULL`, not
  `validating`) is copied to `sessions/<id[0:2]>/<id>.zip`, its size is verified, then
  `backed_up_at` is set. ZIPs are immutable, so this is incremental and never pruned. One
  failing session doesn't stop the others; the run then ends `failed`.

Exit codes: 0 ok, 1 a run failed, 2 bad usage or missing/unknown `BACKUP_TARGET`.

### `.env` keys

```
BACKUP_TARGET=dir:/mnt/backup/task-protocoller   # required; scheme:location
BACKUP_DB_KEEP=14                                # optional, default 14
BACKUP_DUMP_CMD=                                 # optional, default "mariadb-dump"
```

The DB credentials are the app's `DB_*` keys. They go to `mariadb-dump` through a temporary
`--defaults-extra-file` (mode 600, deleted afterwards), never argv. If `BACKUP_DUMP_CMD` has
prefix arguments (for example `docker exec -i tp-mariadb mariadb-dump`), the file would not exist
inside the container, so the same text is sent on stdin as `--defaults-extra-file=/dev/stdin`.
The wrapper must forward stdin (`docker exec -i`, `ssh host ...`).

### systemd

`/etc/systemd/system/task-protocoller-backup.service`:

```ini
[Unit]
Description=TaskProtocoller backup (DB dump + session ZIPs)
After=network-online.target mariadb.service
Wants=network-online.target

[Service]
Type=oneshot
User=taskprot
Group=taskprot
WorkingDirectory=/opt/task-protocoller/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/runBackup.js all
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/mnt/backup/task-protocoller
```

`/etc/systemd/system/task-protocoller-backup.timer`:

```ini
[Unit]
Description=Nightly TaskProtocoller backup

[Timer]
OnCalendar=*-*-* 02:30
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl daemon-reload && systemctl enable --now task-protocoller-backup.timer`.
Check with `systemctl list-timers` and `journalctl -u task-protocoller-backup -n 30 --no-pager`.
`PrivateTmp=true` is fine: the option file is created in the private `/tmp`. The service only
reads `DATA_PATH`, so it needs no write access there.

### Restore a dump

```bash
gunzip -c /mnt/backup/task-protocoller/db/20261022-023000.sql.gz | mariadb task_protocoller
```

Restore into an empty database (see "Reset the database"). The dump contains `CREATE TABLE`
statements. Session ZIPs are copied back from `sessions/` into `DATA_PATH/sessions/`, keeping the
same relative paths.

The views in the dump are `DEFINER=taskprot SQL SECURITY DEFINER`. The restore fails with
`ERROR 1356 ... definer/invoker of view lack rights` unless the `taskprot` user exists and has
privileges on the target database. On a fresh server, create the user first (see "First-time
setup"). To test a dump without touching the live data, restore it into a scratch database and
grant the user on it for the duration:

```bash
mariadb -e "CREATE DATABASE restore_check; GRANT ALL PRIVILEGES ON restore_check.* TO 'taskprot'@'localhost'"
gunzip -c <dump>.sql.gz | mariadb restore_check
mariadb -e "DROP DATABASE restore_check; REVOKE ALL PRIVILEGES ON restore_check.* FROM 'taskprot'@'localhost'"
```

### Add a new target type (SFTP, S3, WebDAV)

1. Write a class implementing `BackupTarget` (`put`, `list`, `remove`, `describe`; see
   `backend/src/backup/BackupTarget.js`). `put` must be atomic and `describe` must not contain secrets.
2. Run it through the shared suite: in a test file call
   `runBackupTargetContract("MyTarget", async () => ({ target, cleanup }))` from
   `backup/backupTargetContract.js`. It must pass.
3. Register the scheme in `backend/src/backup/targetFactory.js` and use `BACKUP_TARGET=<scheme>:<location>`.

Nothing else changes.
