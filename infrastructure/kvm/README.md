# Hostinger KVM 8 — API + PostgreSQL deployment

Status: **prepared, not deployed.** Nothing here has run against a real server. The whole stack (image, both proxy
modes, TLS through Caddy, migrations, backups, restore drills, health checks) was rehearsed locally in disposable
containers: `docs/control-tower/evidence/eng100/a09/`; the database-role split (the API as the RLS runtime login, migrations
as the owner, restores on a new host) in `docs/control-tower/evidence/eng100/fx2/`. Render is retired (`docs/control-tower/RENDER_RETIREMENT.md`).

## Architecture

```
Browser ── https://umrahconnect.io ──► Vercel (Next.js web)
                                        │  /proxy-api/* rewrite (+ X-UC-Proxy-Secret, client-IP header)
                                        ▼
                         https://api.umrahconnect.io  (DNS A record → KVM public IP)
                                        │
            ┌───────────────── KVM 8 (Ubuntu 24.04 LTS) — may host other projects ─────────────────┐
            │ :80/:443  uc-caddy (bundled mode)  — or the host's shared reverse proxy (shared mode) │
            │   └─► uc-api  (Node 22, NestJS, uid 10001, read-only root FS)   network uc-edge       │
            │         └─► uc-postgres 16  network uc-backend (internal: no internet, no host port)  │
            │ timers: nightly pg_dump → /var/backups/umrah-connect → R2 (rclone) · health every min  │
            └──────────────────────────────────────────────────────────────────────────────────────┘
Cloudflare R2: private documents bucket + public media bucket (app) · separate bucket for DB backups
Stripe: webhooks → https://api.umrahconnect.io/api/v1/payments/webhook/stripe
Google OAuth: redirect → https://umrahconnect.io/proxy-api/auth/google/callback
```

Database roles (R05, Row-Level Security — `docs/control-tower/RLS.md`): PostgreSQL policies only bind a role that is
not a superuser, has no BYPASSRLS and does not own the tables.

| Role | Used by | Credentials |
|---|---|---|
| `POSTGRES_USER` (owner, superuser of this cluster) | `uc-migrate` (migrations), backups, restores, `runtime-role.sql`, operators' `exec uc-postgres psql` | `POSTGRES_PASSWORD` — reaches `uc-postgres` and the one-off `uc-migrate` only; blanked in `uc-api` |
| `uc_app_runtime` (NOLOGIN group, created by the RLS migration) | holds the table grants | — |
| `APP_DB_USER` (e.g. `uc_app`, LOGIN, member of `uc_app_runtime`) | `uc-api`: the running API and every one-off `run uc-api …` command (`bootstrap-admin`, `sync-rbac`, `cleanup-orphans`, which run in explicit system scope) | `APP_DB_PASSWORD` — the API's `DATABASE_URL` |

`scripts/deploy.sh` creates/updates the login after every migration (`scripts/runtime-role.sh` does the same by hand),
and `/api/v1/health/ready` answers 503 in production if the API's login is ever a superuser, BYPASSRLS, an owner of
application tables or a member of such a role — a deployment like that fails its health check and is rolled back.

Deliberately absent: Kafka, Redis, Kubernetes, a queue. Rate limits are per-process in memory, which is correct for a
single API container; move the throttler storage to Redis before ever running several.

## Files

| File | Purpose |
|---|---|
| `../../Dockerfile` | Two-stage image; runs as uid 10001 with root-owned (read-only) code; `tini`; health check; `UC_RELEASE` build arg. Never changes the schema on start. |
| `api-entrypoint.sh` | `serve` (default) · `migrate` · `status` · `check-config` · `bootstrap-admin` · `sync-rbac` · `cleanup-orphans` |
| `docker-compose.yml` | `uc-postgres` + `uc-api` (runtime login) + one-off `uc-migrate` (owner, profile `tools`); no host port at all |
| `docker-compose.bundled-proxy.yml` | `uc-caddy` (non-root, publishes 80/443) + a one-shot volume-ownership step |
| `docker-compose.shared-proxy.yml` | joins `uc-api` to an existing reverse proxy's network; publishes nothing |
| `Caddyfile` | TLS, HSTS, 20 MB body limit, hides `/api/docs`, JSON access logs, upstream health checks |
| `.env.production.example` | every production variable by name, including the proxy mode, `OFFSITE_REMOTE` and alerting |
| `scripts/host-setup.sh` | root, idempotent: backup and state directories for the deploy user, env-file mode, systemd units |
| `scripts/preflight.sh` | read-only gate before every deployment |
| `scripts/deploy.sh` | preflight → build → config check → backup → migrate (owner) → runtime login → start → health → tag, or roll back |
| `scripts/runtime-role.sh` | create/update the API's database login and re-apply its grants (`platform/api/prisma/rls/runtime-role.sql`) — after a manual restore |
| `scripts/pg-backup.sh` · `check-offsite.sh` · `pg-restore.sh` | backups with integrity check and off-site copy · off-site reachability · restore drill / replace |
| `scripts/healthcheck.sh` · `alert.sh` | host health check with alert transitions · notification hook |
| `scripts/orphan-cleanup.sh` | O04 orphaned stored-object cleanup (report or apply) |
| `scripts/firewall.sh` | ufw check, then (opt-in) SSH/80/443 rules |
| `scripts/validate-blueprint.sh` | static validation (compose in both modes, ports, Caddyfile, shell, units) — also run by `infra-ci` |
| `systemd/` | `umrah-backup` (02:30 UTC), `umrah-orphan-cleanup` (03:30 UTC), `umrah-healthcheck` (every minute), `umrah-alert@` |

## Sharing the host with other projects

- **Names.** Compose project `umrah-connect`: containers `umrah-connect-uc-<service>-1`, volumes
  `umrah-connect_pgdata|uploads|caddy_data|caddy_config`, networks `umrah-connect_uc-backend|uc-edge`. Services are
  called `uc-postgres`, `uc-api`, `uc-caddy` because a service name is also a DNS name on every network it joins;
  the upstream every proxy uses is the alias `umrah-connect-api`.
- **Ports.** PostgreSQL and the API are never published. Only the bundled proxy publishes 80/443 (`preflight.sh`
  enforces this). For database access use `docker compose --env-file .env.production exec uc-postgres psql -U umrah umrah_connects`.
- **Proxy mode** (`COMPOSE_FILE` in `.env.production`):
  - *bundled* — the host has no other web server: this stack's Caddy owns :80/:443 and obtains certificates.
  - *shared* — another reverse proxy already owns :80/:443 for several projects: set
    `COMPOSE_FILE=docker-compose.yml:docker-compose.shared-proxy.yml` and `SHARED_PROXY_NETWORK=<its Docker network>`,
    then add the site block of `Caddyfile` (unchanged: it targets `umrah-connect-api:4000`) to that proxy. A non-Caddy
    proxy needs the equivalent: TLS for `API_DOMAIN`, `X-Forwarded-For`/`X-Forwarded-Proto`, a 20 MB body limit,
    60 s timeouts, HSTS, `/api/docs*` → 404.
- **Resources.** PostgreSQL memory settings default to a 32 GB host (`PG_SHARED_BUFFERS=4GB`,
  `PG_EFFECTIVE_CACHE_SIZE=16GB`); lower them to this project's share when other projects need memory.
- **Firewall.** `scripts/firewall.sh` only reports until run with `FIREWALL_APPLY=1`, and never changes the defaults of an
  already active ufw. Docker-published ports bypass ufw, which is why this stack publishes nothing but 80/443.

## 1. Server preparation (once)

1. Ubuntu 24.04 LTS. A `deploy` user with SSH key login; `PasswordAuthentication no`, `PermitRootLogin no`.
2. `apt install -y unattended-upgrades fail2ban git rclone` and enable unattended security upgrades.
3. Docker Engine + compose plugin from Docker's apt repository; `usermod -aG docker deploy`.
4. Firewall: `sudo infrastructure/kvm/scripts/firewall.sh` (read the report), then `sudo FIREWALL_APPLY=1 SSH_PORT=22 infrastructure/kvm/scripts/firewall.sh`.
5. `git clone https://github.com/sabilahmad77/umrahconnects.git /opt/umrah-connect` as `deploy` (read-only deploy key).
6. `cd /opt/umrah-connect/infrastructure/kvm && cp .env.production.example .env.production` and fill it in:
   - proxy mode (above); `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` (a different value), `JWT_SECRET`,
     `PROXY_SHARED_SECRET`: `openssl rand -hex 32`; keep `APP_DB_USER=uc_app` unless the name is taken;
   - R2, Stripe, SMTP, Google values from their consoles (§10); `OFFSITE_REMOTE` (§5); `ALERT_WEBHOOK_URL` (§6).
7. `sudo scripts/host-setup.sh` — creates `/var/backups/umrah-connect{,/daily,/weekly}` (deploy, 0700) and
   `/var/lib/umrah-connect` (deploy, 0750), sets `.env.production` to deploy/0600, installs the systemd units.
   Safe to re-run at any time.
8. Off-site backups: configure the rclone remote (§5), then `scripts/check-offsite.sh` must pass.
9. DNS: `api.umrahconnect.io` → A (and AAAA) to the KVM IP. With Cloudflare, use **DNS only** for the first
   certificate, or keep it proxied with SSL mode *Full (strict)*.

## 2. First deployment

```bash
cd /opt/umrah-connect/infrastructure/kvm
./scripts/preflight.sh
docker compose --env-file .env.production up -d uc-postgres
# Legacy data (§3) must be restored here, BEFORE the first migration.
./scripts/deploy.sh <reviewed-commit-sha>        # build, check-config, backup, migrate, runtime login, start, health, tag :current
docker compose --env-file .env.production run --rm -e PLATFORM_ADMIN_EMAIL=… -e PLATFORM_ADMIN_PASSWORD=… uc-api bootstrap-admin
docker compose --env-file .env.production run --rm uc-api sync-rbac
sudo systemctl enable --now umrah-backup.timer umrah-healthcheck.timer umrah-orphan-cleanup.timer
curl -fsS https://api.umrahconnect.io/api/v1/health/ready
```

The API refuses to start with unsafe production configuration (`src/bootstrap/env.validation.ts`, also run by
`api-entrypoint check-config` before every migration): missing secrets, `CORS_ORIGINS=*`, non-https `WEB_URL`, the
sandbox payment provider, local storage without a persistent volume, `MAIL_DRIVER=log`, a partial Google
configuration, `GOOGLE_OIDC_STUB_URL`, any `onrender.com` URL, or a database on `render.com`.

## 3. Moving data off the legacy Render database (one-time, cutover only)

The legacy database was created with `prisma db push` and has no migration history. Order and owner steps:
`docs/control-tower/RENDER_RETIREMENT.md`.

1. Freeze writes (maintenance page on the web, or suspend the Render service).
2. `pg_dump --format=custom --no-owner "$LEGACY_DATABASE_URL" > legacy.dump && sha256sum legacy.dump > legacy.dump.sha256`.
3. Restore into the KVM database:
   `docker compose --env-file .env.production exec -T uc-postgres pg_restore -U umrah -d umrah_connects --no-owner --exit-on-error < legacy.dump`.
4. Prove the restored schema equals the baseline, then record the baseline as applied:
   ```bash
   C="docker compose --env-file .env.production"
   $C exec -T uc-postgres psql -U umrah -d postgres -c 'CREATE DATABASE baseline_check'
   $C exec -T uc-postgres psql -U umrah -d baseline_check -v ON_ERROR_STOP=1 \
     < ../../platform/api/prisma/migrations/20260917000000_baseline/migration.sql
   $C run --rm uc-migrate ./node_modules/.bin/prisma migrate diff \
     --from-url "postgresql://umrah:$POSTGRES_PASSWORD@uc-postgres:5432/baseline_check" \
     --to-url   "postgresql://umrah:$POSTGRES_PASSWORD@uc-postgres:5432/umrah_connects" --exit-code   # must exit 0
   $C exec -T uc-postgres psql -U umrah -d postgres -c 'DROP DATABASE baseline_check'
   $C run --rm uc-migrate ./node_modules/.bin/prisma migrate resolve --applied 20260917000000_baseline
   ```
   Then continue with `scripts/deploy.sh` (it applies the later migrations, including the Row-Level Security one, and
   creates the API's runtime login) and `sync-rbac` (§2). Migration commands always run in `uc-migrate` (the owner);
   `uc-api` connects as the runtime login, which cannot change the schema.
5. Files uploaded to Render's disk are not recoverable (ephemeral, AUD-011). Visa document rows keep their
   metadata; affected documents must be re-uploaded.

## 4. Routine deployment

```bash
cd /opt/umrah-connect/infrastructure/kvm && ./scripts/deploy.sh <reviewed-commit-sha>
```

Refuses commits that are not on `origin/main` and checkouts with local edits, then continues with the deployed
commit's own copy of the script. Runs `preflight.sh`, builds `umrah-connect-api:<sha12>` with `UC_RELEASE=<sha>`, runs
`check-config` in the new image, starts the database and backs it up (an empty first database needs no backup; a
failed off-site copy is a warning, a failed local backup stops the deploy), migrates (`prisma migrate deploy` in the
one-off `uc-migrate` container, as the owner), creates/updates the API's runtime login and re-applies its grants
(`runtime-role.sql`; the password travels only in the environment of that one `psql`, and the step fails unless the
login is not superuser, not BYPASSRLS and owns nothing), starts the stack with `--wait`, checks readiness (which in
production also fails when the API's login could bypass Row-Level Security), then tags the image `:current` (the old one becomes `:previous`;
five release images are kept). On a failed health check it starts `:previous` again, waits until it is healthy,
and returns the checkout to that release's commit. Rehearsed end to end: `docs/control-tower/evidence/eng100/a09/deploy-rehearsal.md`.

## 5. Backups and restore

**Schedule.** `umrah-backup.timer`, 02:30 UTC: `pg_dump -Fc` → `pg_restore --list` (must contain table data) →
SHA-256 (recorded by file name, so any copy verifies) → 14 daily + 8 weekly (Sunday) copies in
`/var/backups/umrah-connect` → off-site copy with size check. Exit 3 means the local dump exists but the off-site
copy failed; the unit fails either way and `umrah-alert@` raises an alert.

**`OFFSITE_REMOTE` contract** (`.env.production`, required in production):
- Form `<rclone-remote>:<bucket>[/<prefix>]`, e.g. `r2-backups:umrah-connect-db-backups/production`. The scripts
  validate the form; `scripts/check-offsite.sh` proves it end to end (remote exists for the deploy user, write,
  read back, delete under `<destination>/.preflight/`). `preflight.sh` runs both before every deployment.
- Missing in production → every backup run fails loudly (the local dump is still written and kept).
  `ALLOW_LOCAL_ONLY_BACKUP=1` exists only for rehearsals and for the safety copy taken by `pg-restore.sh replace`.
- rclone remote requirements (names only; values live in the deploy user's `~/.config/rclone/rclone.conf`, mode 600):
  `type = s3`, `provider = Cloudflare`, `endpoint = https://<account-id>.r2.cloudflarestorage.com`,
  `access_key_id`, `secret_access_key`, `acl = private`, **`no_check_bucket = true`** (a bucket-scoped token may not
  create or list buckets). Create it with `rclone config` as `deploy`. Create the bucket itself in the Cloudflare
  dashboard: with `no_check_bucket = true`, `rclone mkdir` exits 0 without creating anything.
- Cloudflare side: a dedicated bucket (e.g. `umrah-connect-db-backups`), never the application buckets; an R2 API
  token scoped to that one bucket with *Object Read & Write*; lifecycle rules to expire `daily/` after 35 days and
  `weekly/` after 120 days; optionally an R2 bucket lock (retention) rule against deletion by a compromised host.

**Restore drill (monthly, safe).** `scripts/pg-restore.sh /var/backups/umrah-connect/daily/<file>.dump verify` —
verifies the checksum, lists the archive, restores into a scratch database, prints every table's row count, checks
table count and applied migrations, and always drops the scratch database.

**Disaster recovery on a new host.** Prepare the host (§1), `docker compose … up -d uc-postgres`, download the newest
dump **and** its `.sha256` from `OFFSITE_REMOTE/daily/` (`rclone copy`), `scripts/pg-restore.sh <dump> verify`, then
`scripts/pg-restore.sh <dump> replace`, then `scripts/deploy.sh <sha>`.

**Replace the live database** (data damage): `scripts/pg-restore.sh <dump> replace` asks for the database name, takes
a local safety backup, stops `uc-api`, creates the runtime roles if missing, restores with `--exit-on-error`,
re-applies the API's runtime login and grants (`runtime-role.sql`), restarts `uc-api`. Everything written after the
dump is lost — decide consciously. A failed restore leaves `uc-api` stopped.

**After any other restore** (a `pg_restore` by hand, the legacy import in §3, a restore on another server): run
`scripts/runtime-role.sh`, then `docker compose --env-file .env.production restart uc-api`. It re-creates the login
from `APP_DB_USER`/`APP_DB_PASSWORD` and re-applies the grants the API needs; without it the API cannot read the
restored tables. Never "fix" that by pointing the API at the owner: `/health/ready` refuses to report ready.

## 6. Monitoring (I08)

| Layer | What | Where | Activation (owner, after cutover) |
|---|---|---|---|
| Host | `scripts/healthcheck.sh` every minute: containers healthy, API ready inside its container, this host's HTTPS edge and certificate (≥ 14 days), disk < 85 %, a backup newer than 26 h. Alerts after 2 failed runs, repeats hourly, sends one recovery message. | `umrah-healthcheck.timer` | `systemctl enable --now umrah-healthcheck.timer`; set `ALERT_WEBHOOK_URL` |
| Jobs | Failed backup or cleanup → `umrah-alert@<unit>` | `OnFailure=` | same webhook |
| GitHub | `scripts/uptime-check.sh` every 5 min from GitHub's runners: API ready + live, web home, web → `/proxy-api` → API, both certificates, "not served via Render". Failure → failed run (e-mail) + one `uptime-incident` issue, closed on recovery. | `.github/workflows/uptime.yml` | repository variable `UPTIME_MONITOR=on` |
| External | Provider monitor (any HTTPS/keyword monitor, e.g. UptimeRobot, Better Stack, Pingdom, Healthchecks-style): see below | provider | create the account and checks |

External monitor specification (provider-neutral):
1. `GET https://api.umrahconnect.io/api/v1/health/ready` every 1 min from ≥ 2 regions, 10 s timeout, expect HTTP 200
   and the keyword `"ready"`; alert after 2 consecutive failures.
2. `GET https://umrahconnect.io/proxy-api/health/ready` (the browser's path), same rule.
3. `GET https://umrahconnect.io/` → 200.
4. Certificate expiry alerts for `api.umrahconnect.io`, `umrahconnect.io` (and `www.umrahconnect.io` once it has DNS, AUD-020) at 14 days.
5. Alert contacts: the owner's e-mail + the same chat channel as `ALERT_WEBHOOK_URL`.

The GitHub monitor can pause (GitHub delays schedules and stops them in repositories without activity for 60 days),
so it complements the provider monitor rather than replacing it.

## 7. Scheduled jobs

| Unit | When | Command |
|---|---|---|
| `umrah-backup.timer` | 02:30 UTC daily | `scripts/pg-backup.sh` |
| `umrah-orphan-cleanup.timer` | 03:30 UTC daily | `scripts/orphan-cleanup.sh` → `api-entrypoint cleanup-orphans --allow-production [--apply]` (O04, `platform/api/src/modules/storage/cleanup/`). Start with `ORPHAN_CLEANUP_MODE=report`, read a few reports (`journalctl -u umrah-orphan-cleanup`), then switch to `apply`. |
| `umrah-healthcheck.timer` | every minute | `scripts/healthcheck.sh` |

## 8. Operations

- Logs: `docker compose --env-file .env.production logs -f uc-api` (json-file rotation 5 × 20 MB per service);
  host jobs: `journalctl -u umrah-backup -u umrah-healthcheck -u umrah-orphan-cleanup`. Every response carries
  `X-Request-Id`; the same id appears in error logs.
- Health: `/api/v1/health` (liveness, database state, `release`), `/api/v1/health/ready` (503 when the database is
  unreachable, or — in production — when the API's database login is a superuser, BYPASSRLS, an owner of application
  tables or a member of such a role: code `DATABASE_ROLE_UNSAFE`, the reason is in the API log).
- Rotate the API's database password: set a new `APP_DB_PASSWORD` in `.env.production`, then deploy (or
  `scripts/runtime-role.sh` and `docker compose --env-file .env.production up -d uc-api`).
- Validate the blueprint after editing anything here: `scripts/validate-blueprint.sh`.

## 9. Rollback

1. **Application only**: `API_IMAGE=umrah-connect-api:previous docker compose --env-file .env.production up -d --no-deps uc-api`
   (then `docker tag umrah-connect-api:previous umrah-connect-api:current` to make it stick).
2. **Release with migrations**: migrations here are additive (new columns, tables, indexes, enum values), so the
   previous image keeps working against the newer schema and step 1 is normally enough.
3. **Data damage**: `scripts/pg-restore.sh <pre-deploy dump> replace`, then redeploy the previous release. Everything
   written after the dump is lost.
4. Never run `prisma migrate reset` or `db push --accept-data-loss` in production.

## 10. External configuration

| Service | Setting |
|---|---|
| Vercel (web) | `API_PROXY_ORIGIN=https://api.umrahconnect.io`; forward `X-UC-Proxy-Secret` (= `PROXY_SHARED_SECRET`) and the client IP header on `/proxy-api/*` (XT-R05). No variable may reference `onrender.com`. |
| Cloudflare R2 | Private bucket for documents (`S3_BUCKET`, no public access); public bucket with a custom domain for media (`S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`); an API token scoped to those two buckets. A **separate** bucket and token for database backups (§5). |
| Stripe | Webhook `https://api.umrahconnect.io/api/v1/payments/webhook/stripe` with `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`; test keys first |
| Google Cloud | OAuth client (Web), redirect URI `https://umrahconnect.io/proxy-api/auth/google/callback` (and `http://localhost:3000/proxy-api/auth/google/callback` for development) |
| SMTP (Hostinger mail) | `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, a mailbox for `MAIL_FROM`; SPF, DKIM, DMARC on `umrahconnect.io` |
| Monitoring | §6 |
