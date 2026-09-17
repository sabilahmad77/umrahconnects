# KVM stack rehearsal (local Docker, 2026-09-17)

Environment: Colima Docker on the development Mac. Uses `infrastructure/kvm/docker-compose.yml` with a throwaway `.env.production` (random secrets, `STORAGE_DRIVER=local` + persistent volume, `PAYMENT_PROVIDER=none`, `MAIL_DRIVER=none`, `POSTGRES_HOST_PORT=15432` because 5432 is taken locally). Caddy was not started (public ports 80/443 and ACME need a real host). `scripts/deploy.sh` was not run because it checks out commits in the repository.

| Step | Command | Result |
|---|---|---|
| Image | `docker build -t umrah-connect-api:core-check .` | built; runs as `uid=10001(app)`; contains no `.env` files (only `.env.example`) |
| Unsafe config | `docker run -e NODE_ENV=production -e CORS_ORIGINS='*' -e PAYMENT_PROVIDER=sandbox …` | refused to start and listed the problems |
| Database | `docker compose up -d postgres` | healthy (PostgreSQL 16) |
| Migrations | `docker compose run --rm api migrate` | baseline + 2 migrations applied |
| Super Admin | `… api bootstrap-admin` (strong password) | "Super Admin ready: ops@umrahconnect.io" |
| Weak password | `… PLATFORM_ADMIN_PASSWORD=password … bootstrap-admin` | exit 1, "must be ≥14 chars with upper, lower, digit and symbol" |
| API | `docker compose up -d api` (read-only root FS, `cap_drop: ALL`, `no-new-privileges`) | `healthy`; `/api/v1/health` → `db: connected`; access policy check: 324 routes |
| Backup | `BACKUP_DIR=… scripts/pg-backup.sh` | custom-format dump, integrity-listed, `.sha256`, both mode 600 |
| Restore drill | `scripts/pg-restore.sh <dump> verify` | restored into a scratch DB: 1 tenant, 1 user, 3 migrations; scratch DB dropped |
| Tamper check | restore of a modified dump | refused (checksum mismatch), exit 1 |

Defects found and fixed during the rehearsal:
- The backup/restore scripts sourced `.env.production` with the shell, which breaks on values containing `<`, `$`, spaces, etc. They now read single keys without executing the file.
- Under `set -euo pipefail`, a missing optional key (e.g. `OFFSITE_REMOTE`) aborted the backup silently. Lookups now tolerate missing keys.
- The PostgreSQL loopback port is now configurable (`POSTGRES_HOST_PORT`).
- (Earlier, during the image smoke test) nested `.env` files were copied into the image; `.dockerignore` now excludes env files at any depth, and production ignores env files.

Separate container smoke test (fresh PostgreSQL 16, same image): `migrate` from empty applied 3 migrations; `status` "up to date"; Swagger 404 in production; anonymous `/admin/users` 401; `forgot-password` 503 when mail is not configured (no fake success); `/payments/webhook/sandbox` 404 in production; HSTS and a `default-src 'none'` CSP present.
