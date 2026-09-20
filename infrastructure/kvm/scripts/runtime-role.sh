#!/usr/bin/env bash
# R05 — create/update the API's database login (APP_DB_USER, member of uc_app_runtime) and re-apply the runtime
# grants in the application database (platform/api/prisma/rls/runtime-role.sql, idempotent), as the owner inside
# uc-postgres. deploy.sh (after every migration) and `pg-restore.sh <dump> replace` run it themselves; run it by hand
# after any other restore or manual schema change, then `docker compose --env-file .env.production restart uc-api`.
# Never prints the password; exits non-zero unless the login is not superuser, not BYPASSRLS and owns nothing.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

compose up -d --wait --wait-timeout 120 uc-postgres
apply_runtime_role "$(cd ../.. && pwd -P)" || die "runtime login setup failed"
