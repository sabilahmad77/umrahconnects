# Hostinger KVM 8 — API + PostgreSQL deployment

Status: **prepared, not deployed.** Nothing in this directory has been run against a real server.

## Architecture

```
Browser ── https://umrahconnect.io ──► Vercel (Next.js web)
                                        │  /proxy-api/* rewrite (+ X-UC-Proxy-Secret, client-IP header)
                                        ▼
                         https://api.umrahconnect.io  (DNS A record → KVM public IP)
                                        │
                         ┌──────────── KVM 8 (Ubuntu 24.04 LTS) ─────────────┐
                         │ Caddy 2  :80/:443   automatic HTTPS, HSTS, 20 MB  │
                         │   └─► api (Node 22, NestJS)  :4000  internal only │
                         │         └─► postgres 16      :5432  internal +    │
                         │                              127.0.0.1 (backups)  │
                         │ nightly pg_dump → /var/backups (+ optional R2)    │
                         └────────────────────────────────────────────────────┘
Cloudflare R2: private documents bucket (presigned GETs) + public media bucket
Stripe: webhooks → https://api.umrahconnect.io/api/v1/payments/webhook/stripe
Google OAuth: redirect → https://umrahconnect.io/proxy-api/auth/google/callback
```

Deliberately absent: Kafka, Redis, Kubernetes, a separate queue. The API does not need them at current scale (`KAFKA_ENABLED=false`; rate limits are per-process in memory, which is correct for a single API container). If the API is ever scaled to several containers, move the throttler storage to Redis first.

KVM 8 sizing (8 vCPU, 32 GB RAM, 400 GB NVMe): PostgreSQL `shared_buffers=4GB`, `effective_cache_size=16GB`, `max_connections=100`; API pool `connection_limit=20`.

## Files

| File | Purpose |
|---|---|
| `../../Dockerfile` | Two-stage image, non-root user (uid 10001), `tini`, health check. **Never changes the schema on start.** |
| `api-entrypoint.sh` | `serve` (default) · `migrate` · `status` · `bootstrap-admin` · `sync-rbac` |
| `docker-compose.yml` | postgres + api + caddy on a private network; only 80/443 published; api read-only root FS, all capabilities dropped |
| `Caddyfile` | TLS, HSTS, request size limit, hides `/api/docs`, JSON access logs, upstream health checks |
| `.env.production.example` | Every production variable by name (copy to `.env.production` on the server, `chmod 600`) |
| `scripts/deploy.sh` | build → backup → migrate → start → health check → tag, or roll back the container |
| `scripts/pg-backup.sh` | `pg_dump -Fc`, integrity check, sha256, 14 daily + 8 weekly, optional `rclone` copy to R2 |
| `scripts/pg-restore.sh` | `verify` (restore into a scratch DB and count rows) or `replace` (guarded) |
| `scripts/firewall.sh` | ufw: deny inbound except SSH (rate-limited), 80, 443 |
| `systemd/umrah-backup.*` | Nightly backup timer (02:30 UTC) |

## 1. Server preparation (once)

1. Ubuntu 24.04 LTS. Create a `deploy` user with SSH key login; disable password and root SSH login (`/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`).
2. `apt install -y unattended-upgrades fail2ban git rclone` and enable unattended security upgrades.
3. Install Docker Engine + compose plugin from Docker's apt repository; add `deploy` to the `docker` group.
4. `sudo SSH_PORT=22 infrastructure/kvm/scripts/firewall.sh`.
5. `git clone https://github.com/sabilahmad77/umrahconnects.git /opt/umrah-connect` (read-only deploy key).
6. `cp infrastructure/kvm/.env.production.example infrastructure/kvm/.env.production && chmod 600 …` and fill values:
   - `POSTGRES_PASSWORD`, `JWT_SECRET`, `PROXY_SHARED_SECRET`: `openssl rand -hex 32` (hex keeps them URL-safe).
   - R2, Stripe, SMTP, Google values from their consoles (see §5).
7. DNS: `api.umrahconnect.io` → A record to the KVM IP. With Cloudflare, use **DNS only** (grey cloud) for the first certificate issuance, or keep it proxied with SSL mode *Full (strict)*.
8. Backups: `sudo cp infrastructure/kvm/systemd/umrah-backup.* /etc/systemd/system/ && sudo systemctl enable --now umrah-backup.timer`.

## 2. First deployment

```bash
cd /opt/umrah-connect/infrastructure/kvm
docker compose --env-file .env.production up -d postgres
# Data from the legacy database (see §3) must be restored here BEFORE migrating.
docker compose --env-file .env.production build api
docker compose --env-file .env.production run --rm api migrate
docker compose --env-file .env.production run --rm -e PLATFORM_ADMIN_EMAIL=… -e PLATFORM_ADMIN_PASSWORD=… api bootstrap-admin
docker compose --env-file .env.production run --rm api sync-rbac
docker compose --env-file .env.production up -d
curl -fsS https://api.umrahconnect.io/api/v1/health/ready
```

The API refuses to start with unsafe production configuration (`src/bootstrap/env.validation.ts`): missing secrets, `CORS_ORIGINS=*`, non-https `WEB_URL`, the sandbox payment provider, local storage without a persistent volume, `MAIL_DRIVER=log`, a partial Google configuration.

## 3. Moving data off Render Postgres

The legacy production database was created with `prisma db push` and has no migration history.

1. Freeze writes (maintenance page on the web, or stop the Render service).
2. `pg_dump --format=custom --no-owner "$LEGACY_DATABASE_URL" > legacy.dump`.
3. Restore into the KVM database: `docker compose … exec -T postgres pg_restore -U umrah -d umrah_connects --no-owner < legacy.dump`.
4. Prove the restored schema equals the baseline, then record the baseline as applied:
   ```bash
   C="docker compose --env-file .env.production"
   $C exec -T postgres psql -U umrah -d postgres -c 'CREATE DATABASE baseline_check'
   $C exec -T postgres psql -U umrah -d baseline_check -v ON_ERROR_STOP=1 \
     < ../../platform/api/prisma/migrations/20260917000000_baseline/migration.sql
   $C run --rm api ./node_modules/.bin/prisma migrate diff \
     --from-url "postgresql://umrah:$POSTGRES_PASSWORD@postgres:5432/baseline_check" \
     --to-url   "postgresql://umrah:$POSTGRES_PASSWORD@postgres:5432/umrah_connects" --exit-code   # must exit 0
   $C exec -T postgres psql -U umrah -d postgres -c 'DROP DATABASE baseline_check'
   $C run --rm api ./node_modules/.bin/prisma migrate resolve --applied 20260917000000_baseline
   docker compose … run --rm api migrate          # applies the later migrations
   docker compose … run --rm api sync-rbac        # legacy Operator Admins → OPERATOR_ADMIN, roleless travelers → PILGRIM
   ```
   (The same procedure was proven locally: baseline-vs-database diff exit 0, then `migrate resolve` and `migrate deploy`.)
5. Uploaded files on Render's disk are not recoverable (ephemeral, AUD-011). Visa document rows keep their metadata; affected documents must be re-uploaded.

## 4. Routine deployment

```bash
cd /opt/umrah-connect/infrastructure/kvm && ./scripts/deploy.sh <reviewed-commit-sha>
```

Deploys only reviewed commits from `main`. The script takes a backup before migrating.

## 5. External configuration

| Service | Setting |
|---|---|
| Vercel (web) | `API_PROXY_ORIGIN=https://api.umrahconnect.io`; forward `X-UC-Proxy-Secret` (= `PROXY_SHARED_SECRET`) and the client IP header on `/proxy-api/*` (cross-track request XT-R05) |
| Cloudflare R2 | Private bucket for documents (`S3_BUCKET`, no public access, no public dev URL); public bucket with a custom domain for media (`S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`); an API token scoped to those two buckets (Object Read & Write) |
| Stripe | Webhook endpoint `https://api.umrahconnect.io/api/v1/payments/webhook/stripe` with events `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`; test keys first |
| Google Cloud | OAuth client (Web). Authorized redirect URI `https://umrahconnect.io/proxy-api/auth/google/callback` (and `http://localhost:3000/proxy-api/auth/google/callback` for development) |
| SMTP (Hostinger mail) | `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, a mailbox for `MAIL_FROM`; SPF, DKIM and DMARC records on `umrahconnect.io` |
| Uptime monitor | HTTPS check on `https://api.umrahconnect.io/api/v1/health/ready` every minute, alert after 2 failures |

## 6. Operations

- Logs: `docker compose --env-file .env.production logs -f api` (JSON rotation 5 × 20 MB per service). Every response carries `X-Request-Id`; the same id appears in error logs.
- Health: `/api/v1/health` (liveness + DB), `/api/v1/health/ready` (fails when the DB is unreachable).
- Disk: alert at 80 % (`df -h /var/lib/docker /var/backups`).
- Restore drill: monthly `scripts/pg-restore.sh <latest dump> verify`.
- Backups off the server: set `OFFSITE_REMOTE` (an `rclone` R2 remote with a bucket separate from application data). Without it, backups live only on the same disk — not acceptable for launch.

## 7. Rollback

1. **Application only** (no migration in the release): `API_IMAGE=umrah-connect-api:previous docker compose --env-file .env.production up -d api`.
2. **Release with migrations**: migrations in this repository are additive (new columns, tables, indexes, enum values). The previous image keeps working against the newer schema, so step 1 is normally enough.
3. **Data damage**: stop the API, `scripts/pg-restore.sh <pre-deploy dump> replace`, redeploy the previous image. Everything written after the dump is lost — decide consciously.
4. Never run `prisma migrate reset` or `db push --accept-data-loss` in production.
