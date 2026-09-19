# Infrastructure

Target: **Vercel** (web) → **Hostinger KVM 8** (API + PostgreSQL 16 behind Caddy or the host's shared reverse proxy)
→ **Cloudflare R2** (objects, and a separate bucket for database backups), **Stripe** (payments), SMTP (mail),
Google (sign-in). **Render is retired from the target** — three separately tracked states in `RENDER_RETIREMENT.md`.
Runbook: `infrastructure/kvm/README.md`. Evidence: `evidence/kvm-rehearsal.md` (2026-09-17) and
`evidence/eng100/a09/` (Render isolation, shared-host blueprint, backup/restore rehearsal, monitoring).

## Hosting inventory

| Reference | Where | Classification | Action |
|---|---|---|---|
| Vercel web deployment of `main` | Vercel dashboard; README | ACTIVE, REQUIRED | Keep. Set `API_PROXY_ORIGIN=https://api.umrahconnect.io` at cutover (XT-R05). |
| Render web service `umrah-connect-api` (`srv-d94peplckfvc73adlr9g`) | Render dashboard only (`render.yaml` deleted) | RETIRED from the target; still exists, not suspended, unresponsive | State 1 done in the repository; states 2 (key revocation) and 3 (decommission after cutover) are owner steps — `RENDER_RETIREMENT.md`. |
| Render Postgres `dpg-d94o1dtckfvc73abpon0-a` | HANDOFF | One-time data source for the cutover | Dump first, restore into KVM (runbook §3), delete only after the KVM data is verified. |
| Neon (suggested by the old Render guide) | history only | NEVER USED (no evidence) | None. |
| Koyeb (alternative in old docs) | history only | NEVER USED | Health-controller comment updated. |
| `onrender.com` fallback in `apps/web/next.config.mjs` | web | REMOVED | A production build without `API_PROXY_ORIGIN` fails. |
| trycloudflare quick tunnels | `start-all.sh`, mobile fallback URL | DEV ONLY | Not part of any production path. |
| Kafka (kafkajs, root compose) | `events.service.ts`, `docker-compose.yml` | NOT REQUIRED | Disabled by default; the code path fails soft. |
| Redis (ioredis dependency, root compose) | dev compose | NOT REQUIRED | Only needed if the API ever scales horizontally (throttler store). |
| MinIO / Mailhog in root `docker-compose.yml` | dev compose | DEV ONLY | Kept for local development. |
| Docker, Compose | `Dockerfile`, `infrastructure/kvm/docker-compose*.yml` | REQUIRED (KVM runtime) | Base stack + one proxy-mode file (bundled or shared). |
| Caddy | `infrastructure/kvm/Caddyfile` | REQUIRED in bundled mode | Non-root; in shared mode the same site block goes into the host's proxy. |
| rclone | host package | REQUIRED for off-site backups | `OFFSITE_REMOTE` contract (runbook §5). |
| GitHub Actions | `.github/workflows/api-ci.yml`, `infra-ci.yml`, `uptime.yml` | ACTIVE on push; `uptime` inert until `UPTIME_MONITOR=on` | Owner enables the uptime monitor after cutover. |

## Production topology decisions

- One API container is enough for launch. Scaling out requires a shared throttler store.
- The KVM may host other projects. Everything is namespaced by the compose project `umrah-connect` and `uc-` service
  names; the stack publishes no host port except the bundled proxy's 80/443. In shared-proxy mode it publishes nothing.
- PostgreSQL runs in a container with a named volume and data checksums, on an internal network with no internet
  access and no host port. Administration goes through `docker compose exec`.
- Migrations are an explicit deploy step (`scripts/deploy.sh`): configuration check in the new image, backup,
  `prisma migrate deploy`, start, readiness check, tag; rollback to `:previous` on a failed health check.
- TLS terminates at Caddy (or the shared proxy). HSTS is sent by both the proxy and the API. The API trusts exactly
  one proxy hop (`TRUST_PROXY=1`) plus the proxy-secret client-IP header from the web tier.
- Secrets live only in `/opt/umrah-connect/infrastructure/kvm/.env.production` (deploy user, mode 600) and the deploy
  user's rclone config; never in images (`.dockerignore`, `ignoreEnvFile` in production).
- Backups: nightly `pg_dump -Fc`, integrity listing, SHA-256 by file name, 14 daily + 8 weekly local copies, a
  **required** off-site copy (`OFFSITE_REMOTE`, size-verified), monthly restore drill (`pg-restore.sh verify`).
- Monitoring: host health timer with alert transitions, failure alerts for backup/cleanup units, a scheduled GitHub
  probe, and a provider monitor configured by the owner (runbook §6).
- Firewall: only SSH (rate-limited), 80 and 443; the script reports before it changes anything and never rewrites an
  active ufw's defaults.

## Vercel ↔ API contract

| Item | Value |
|---|---|
| Browser API base | `https://umrahconnect.io/proxy-api` (Next rewrite, same origin — no CORS needed for the web app) |
| Rewrite target | `API_PROXY_ORIGIN=https://api.umrahconnect.io` (never an `onrender.com` host) |
| Proxy headers | `X-UC-Proxy-Secret` (= `PROXY_SHARED_SECRET`), `x-vercel-forwarded-for` |
| Cookies | `__Host-uc_rt` (httpOnly, Secure, SameSite=Lax, Path=/), `uc_g_state` (OAuth state, 10 min) |
| OAuth redirect | `https://umrahconnect.io/proxy-api/auth/google/callback` |
| CORS (direct API access) | `CORS_ORIGINS=https://umrahconnect.io,https://www.umrahconnect.io`; optional `CORS_ORIGIN_REGEX` for previews |
| Public media | `S3_PUBLIC_BASE_URL` host must be in Next `images.remotePatterns` (XT-R11) |
| No localhost or Render dependencies | production refuses non-https `WEB_URL`, requires `CORS_ORIGINS`, and refuses `onrender.com` URLs and `render.com` databases |
| Health for monitors | `GET /api/v1/health/ready` → 200 `{"status":"ready"}` or 503; `GET /api/v1/health` → `db`, `release` |
