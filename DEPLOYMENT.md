# Deployment

The API deployment guide lives in **[infrastructure/kvm/README.md](infrastructure/kvm/README.md)** (Hostinger KVM 8:
Docker Compose, Caddy HTTPS, PostgreSQL 16, backups, rollback). The hosting inventory and the Vercel ↔ API contract are in
**[docs/control-tower/INFRASTRUCTURE.md](docs/control-tower/INFRASTRUCTURE.md)**.

The previous Render + Neon guide is retired. `render.yaml` is kept, marked deprecated, until the KVM cutover.

Rules:
- Deploy only reviewed commits that pass `.github/workflows/api-ci.yml`.
- Migrations are an explicit step (`docker compose run --rm api migrate`). The container never changes the schema on start.
- Production configuration is validated at boot. Unsafe values stop the API from starting.
