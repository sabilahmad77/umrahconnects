# Deployment

Target architecture: **Vercel** (web, auto-deploys from `main`) → **Hostinger KVM 8** (API + PostgreSQL 16 behind
Caddy, Docker Compose) → Cloudflare R2 (objects) and Stripe (payments).

- API runbook: **[infrastructure/kvm/README.md](infrastructure/kvm/README.md)** — server setup, first deployment,
  routine deployment, backups and restore, monitoring, rollback.
- Hosting inventory and the Vercel ↔ API contract: **[docs/control-tower/INFRASTRUCTURE.md](docs/control-tower/INFRASTRUCTURE.md)**.
- Render retirement (what is done, what the owner still has to do, and in which order):
  **[docs/control-tower/RENDER_RETIREMENT.md](docs/control-tower/RENDER_RETIREMENT.md)**.

Render is **retired from the target architecture**. `render.yaml` was removed from the repository; the legacy Render
service itself keeps running until the owner decommissions it after the KVM cutover (see RENDER_RETIREMENT.md).

Rules:
- Deploy only reviewed commits of `main` that pass `.github/workflows/api-ci.yml` (`scripts/deploy.sh` refuses others).
- Migrations are an explicit deploy step, taken after a backup (`scripts/deploy.sh`). The container never changes the schema on start.
- Production configuration is checked before deploying (`scripts/preflight.sh`, `api-entrypoint check-config`) and again
  when the API boots. Unsafe values stop the API from starting.
