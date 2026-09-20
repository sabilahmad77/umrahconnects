# FX2 evidence — R05 (Row-Level Security) in production, F19

Worker FX2, branch `eng100/fx2`. Everything below ran locally on 2026-09-19 in disposable Docker
resources named `uc-fx2-*` (colima), removed afterwards. Nothing ran against a real server, and no
provider (Stripe, R2, SMTP, Google) was called.

| File | What it shows |
|---|---|
| `blueprint-validation.txt` | `infrastructure/kvm/scripts/validate-blueprint.sh`: `docker compose config` in **both proxy modes**, published ports, and the new database-role split check (uc-api = `APP_DB_USER` without the owner password; `uc-migrate` = owner, profile `tools`, `uc-backend` only). All checks passed (shellcheck and systemd-analyze are not installed on this Mac: SKIP). |
| `rls-production-rehearsal.txt` | Full transcript of the rehearsal: every command and its output with its exit code. Docker build steps and container state lines are filtered out; the local temp path is shown as `$TMPDIR`. No secret value appears (checked: 0 occurrences of each throwaway secret). |

## What changed (F19)

- `infrastructure/kvm/docker-compose.yml`: `uc-api` connects as `APP_DB_USER`/`APP_DB_PASSWORD`; the owner's
  `POSTGRES_PASSWORD`, which `env_file` would pass in, is blanked for `uc-api`. New one-off `uc-migrate` (profile
  `tools`, owner URL, `uc-backend` only, read-only, no capabilities) runs `prisma migrate deploy`/`status`.
- `scripts/deploy.sh`: … backup → `run --rm uc-migrate` → `apply_runtime_role` (`platform/api/prisma/rls/runtime-role.sql`
  inside `uc-postgres`; the password travels only in that exec's environment; the step fails unless the last line
  reads `<login>|f|f|f`) → start → `/health/ready`.
- `scripts/pg-restore.sh replace`: creates the runtime roles before `pg_restore` (a new host has none, and the dump's
  privileges name `uc_app_runtime`), re-applies the login's grants after it; `scripts/runtime-role.sh` does the same by
  hand after any other restore. An off-site outage no longer blocks the restore (its local safety copy is complete).
- `scripts/preflight.sh`: `APP_DB_USER` (plain name; not the owner, `postgres`, `uc_app_runtime`, `pg_*`) and
  `APP_DB_PASSWORD` (URL-safe, ≥ 24, not the owner's) are validated. `.env.production.example` documents both.
- `platform/api/prisma/rls/runtime-role.sql`: a missing variable or an owner login is an error (exit 3), the password
  statement is kept out of the server log, default privileges are re-applied, it runs on an empty database.
- API: `GET /api/v1/health/ready` answers **503 `DATABASE_ROLE_UNSAFE`** in production when the API's login is a
  superuser, has BYPASSRLS, owns (or is a member of the owner of) an application table, or is a member of a
  superuser/BYPASSRLS role. The reason goes to the log once per change, never into the public response.
  Unit: `src/modules/health/health.controller.spec.ts`; e2e: `test/health.e2e-spec.ts`.

## Rehearsal (disposable compose project `uc-fx2-deploy`, shared-proxy mode, network `uc-fx2-proxy`)

The API image was built from this branch (`umrah-connect-api:137ce9e03463`, `docker build` with `UC_RELEASE`), and
`deploy.sh` ran from a local clone with a throwaway `.env.production` (random secrets, local storage, no provider
credentials), `UC_DEPLOY_CHECKED_OUT=<sha>`, `PREFLIGHT_SKIP_OFFSITE=1`, `BACKUP_DIR` in the temp directory.

| Step | Result |
|---|---|
| preflight with `APP_DB_USER=umrah` (= owner) / with the owner's password reused | FAIL on exactly that check, exit 1 |
| `deploy.sh` (first deployment, empty database) | 9 migrations applied in `uc-migrate`; `runtime login uc_app: not superuser, no BYPASSRLS, owns nothing`; API healthy; `deployed 137ce9e…` |
| `/health/ready` from inside `uc-api` | `{"status":"ready","rowLevelSecurity":"enforced"}` |
| `pg_stat_activity` (owner view) | the API's connections belong to `uc_app` |
| roles | `uc_app` f/f (login, member of `uc_app_runtime`), `uc_app_runtime` f/f, owner `umrah` t/t |
| `docker inspect` of `uc-api` | `DATABASE_URL=postgresql://uc_app:***@…`, `POSTGRES_PASSWORD=` (empty); owner password value: 0 occurrences |
| cross-tenant probe as `uc_app` over TCP with its password (the API's exact login) | no scope → 0 rows; tenant scope A → only `PLATE-A`; company B's rows: 0 visible, `UPDATE 0`, `DELETE 0`, INSERT into B → `new row violates row-level security policy`; `SET row_security = off` → refused; `ALTER TABLE … DISABLE ROW LEVEL SECURITY` → `must be owner` |
| the same image connected as the owner (`run -e DATABASE_URL=<owner>`) | `/health/ready` → **HTTP 503 `DATABASE_ROLE_UNSAFE`**, `/health` → 200; log: `Database role "umrah" is a superuser, has BYPASSRLS, owns … Readiness answers 503.` |
| role script without a password / with the owner as login | exit 3 with a clear message; the owner stays superuser |
| `scripts/runtime-role.sh` re-run | idempotent, `uc_app: not superuser, no BYPASSRLS, owns nothing` |
| postgres server log | neither password value appears |
| `sync-rbac`, `bootstrap-admin` in `uc-api` (runtime login), login as that admin, `uc-migrate status` | all succeed |
| backup → damage → `pg-restore.sh replace` (same host) | first attempt stopped at the safety backup (exit 3: rclone absent) → fixed (`073f0c6`); then restored, login re-applied, API ready + enforced, damaged row back |
| new host: empty cluster (no runtime roles) | the pre-fx2 restore step fails: `role "uc_app_runtime" does not exist` (`GRANT USAGE ON SCHEMA audit TO uc_app_runtime`) |
| new host: `pg-restore.sh replace` (fx2) | roles created, dump restored, grants re-applied, API ready + enforced as `uc_app`; cross-tenant probe holds again |
| cleanup | `compose down -v`, network and image tags removed; no `uc-fx2` container/volume/network left |

Not verified: a real Hostinger host, the bundled-proxy mode end to end (its Caddyfile bind mount is outside
colima's shared paths when run from the temp directory; `compose config` of that mode passed), rclone off-site copies
(rclone not installed), and the image `HEALTHCHECK` turning unhealthy for an owner connection (it needs ~2 minutes
of start period + retries; readiness itself answered 503 at once).
