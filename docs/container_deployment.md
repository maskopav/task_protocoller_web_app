# Deploying to the test container (`share_web`)

How to deploy this app to the test container at `192.168.122.183`, written for
people and for coding agents. The first two sections cover a routine redeploy.
The rest covers first-time setup, resetting the database and troubleshooting.

## Target at a glance

| | |
|---|---|
| SSH | `ssh share_web` (`~/.ssh/config`: `HostName 192.168.122.183`, `Port 10000`, `User root`, `IdentityFile ~/.ssh/id_ed25519`) |
| Public URL | `http://192.168.122.183:10001` (VM port 10001 → container port 80) |
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
#    (VITE_API_BASE=/api, VITE_APP_BASE_PATH=/), which is what nginx expects.
(cd frontend && npm ci && npm run build)

# 3. Upload. Keep these excludes: they protect the server's .env, logs and
#    installed node_modules.
S="ssh -o BatchMode=yes -o ServerAliveInterval=10"
rsync -az --delete -e "$S" --exclude node_modules --exclude logs --exclude '.env*' --exclude uploads \
  backend/ share_web:/opt/task-protocoller/backend/
rsync -az --delete -e "$S" frontend/dist/ share_web:/opt/task-protocoller/frontend/
rsync -az --delete -e "$S" frontend/src/i18n/ share_web:/opt/task-protocoller/locales/

# 4. Install deps (only needed when package-lock.json changed, harmless otherwise),
#    fix ownership, restart
ssh share_web 'cd /opt/task-protocoller/backend && npm ci --omit=dev >/tmp/npm_ci.log 2>&1 || tail -20 /tmp/npm_ci.log;
  chown -R taskprot:taskprot /opt/task-protocoller && systemctl restart task-protocoller && sleep 2 &&
  systemctl is-active task-protocoller && journalctl -u task-protocoller -n 5 --no-pager -o cat'
```

If the change adds columns or tables, apply the non-destructive upgrade
(`scripts/schema/alter_permissions.sql` and the views). This keeps existing data:

```bash
ssh share_web 'cd /opt/task-protocoller/backend && sudo -u taskprot node src/applyPermissions.js'
```

Then run the checks under [Verify](#verify).

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
EOF
mkdir -p logs; chown -R taskprot:taskprot /opt/task-protocoller
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
ReadWritePaths=/opt/task-protocoller/backend/logs

[Install]
WantedBy=multi-user.target
```

`ProtectSystem=strict` leaves the filesystem read-only for the app except for
`logs/`. If a feature later needs to write somewhere else (for example uploads
under `DATA_PATH`), add that path to `ReadWritePaths`.

### 5. nginx site — `/etc/nginx/sites-available/task-protocoller`

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    server_tokens off;

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
| `Unknown column 'token_version'` | Old schema: run `node src/applyPermissions.js` as shown above |

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
