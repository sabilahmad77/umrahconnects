# Infrastructure

Target: **Vercel** (web) → **Hostinger KVM 8** (API + PostgreSQL 16 behind Caddy) → **Cloudflare R2** (objects), **Stripe** (payments), SMTP (mail), Google (sign-in). The implementation-ready runbook is `infrastructure/kvm/README.md`. The local rehearsal is in `evidence/kvm-rehearsal.md`.

## Hosting inventory

| Reference | Where | Classification | Action |
|---|---|---|---|
| Vercel web deployment of `main` | Vercel dashboard; README | ACTIVE, REQUIRED | Keep. Set `API_PROXY_ORIGIN` at cutover (XT-R05). |
| Render web service `umrah-connect-api` (`srv-d94peplckfvc73adlr9g`) | `render.yaml`, README, HANDOFF, DEPLOYMENT | ACTIVE-BUT-DOWN (AUD-001) → OBSOLETE after cutover | Blueprint marked deprecated, values made production-safe. Remove after the KVM cutover. |
| Render Postgres `dpg-d94o1dtckfvc73abpon0-a` | HANDOFF | ACTIVE (data source) → OBSOLETE after migration | Dump and restore into KVM (runbook §3), then retire. |
| Neon (suggested in `DEPLOYMENT.md`) | DEPLOYMENT.md | UNKNOWN (no evidence it was used) | Superseded by the KVM runbook. |
| Koyeb (alternative in docs) | DEPLOYMENT.md, health controller comment | OBSOLETE (never used) | Doc reference only. |
| `onrender.com` fallback in `apps/web/next.config.mjs` | web | OBSOLETE after cutover | Cross-track XT-R05 (Codex-owned file). |
| trycloudflare quick tunnels | `start-all.sh`, mobile fallback URL, old CORS regex | OBSOLETE | Removed from the API CORS rule. The script and mobile fallback remain (dev tool; mobile out of scope). |
| Kafka (kafkajs, compose) | `events.service.ts`, `docker-compose.yml` | NOT REQUIRED | Default is now disabled. The code path is kept (fails soft). |
| Redis (`REDIS_URL`, ioredis dependency, compose) | env templates, compose | NOT REQUIRED | Removed from the API env template. Only needed if the API ever scales horizontally (throttler store). |
| MinIO / Mailhog in root `docker-compose.yml` | dev compose | DEV ONLY | Kept for local development. |
| S3 / Cloudinary stubs | storage service | Cloudinary OBSOLETE; S3 → implemented as S3/R2 driver | Cloudinary removed. |
| Docker | Dockerfile, compose | REQUIRED (runtime on KVM) | Rewritten (non-root, no schema push). |
| Caddy | `infrastructure/kvm/Caddyfile` | NEW, REQUIRED | Automatic HTTPS and reverse proxy. |

## Production topology decisions

- One API container is enough for launch. Scaling out requires a shared throttler store.
- PostgreSQL runs in a container with a named volume and data checksums. It is reachable only on the internal network and on host loopback for backups.
- Migrations are an explicit deploy step (`docker compose run --rm api migrate`), preceded by a backup (`scripts/deploy.sh`).
- TLS terminates at Caddy. HSTS is sent by both Caddy and the API in production. The API trusts exactly one proxy hop (`TRUST_PROXY=1`) plus the proxy-secret client-IP header from the web tier.
- Secrets live only in `/opt/umrah-connect/infrastructure/kvm/.env.production` (mode 600) and are never baked into images (`.dockerignore`, `ignoreEnvFile` in production).
- Backups: nightly `pg_dump -Fc` with an integrity check, SHA-256, 14 daily + 8 weekly copies, an optional off-site copy, and a monthly restore drill.
- Firewall: only SSH (rate-limited), 80 and 443 are open.

## Vercel ↔ API contract

| Item | Value |
|---|---|
| Browser API base | `https://umrahconnect.io/proxy-api` (Next rewrite, same origin — no CORS needed for the web app) |
| Rewrite target | `API_PROXY_ORIGIN=https://api.umrahconnect.io` |
| Proxy headers | `X-UC-Proxy-Secret` (= `PROXY_SHARED_SECRET`), `x-vercel-forwarded-for` |
| Cookies | `__Host-uc_rt` (httpOnly, Secure, SameSite=Lax, Path=/), `uc_g_state` (OAuth state, 10 min) |
| OAuth redirect | `https://umrahconnect.io/proxy-api/auth/google/callback` |
| CORS (direct API access) | `CORS_ORIGINS=https://umrahconnect.io,https://www.umrahconnect.io`; optional `CORS_ORIGIN_REGEX` for previews |
| Public media | `S3_PUBLIC_BASE_URL` host must be in Next `images.remotePatterns` (XT-R11) |
| No localhost dependencies | production refuses non-https `WEB_URL` and requires `CORS_ORIGINS` |
