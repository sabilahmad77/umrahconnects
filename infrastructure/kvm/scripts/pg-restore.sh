#!/usr/bin/env bash
# Restore a backup.
#   scripts/pg-restore.sh <dump> verify   → restores into a scratch database, checks row counts, drops it (safe, run monthly)
#   scripts/pg-restore.sh <dump> replace  → replaces the live database (stop the API first; asks for confirmation)
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:?usage: pg-restore.sh <dump> verify|replace}"
MODE="${2:?usage: pg-restore.sh <dump> verify|replace}"
# Read single values from .env.production without executing it (values may contain shell metacharacters).
env_get() { { grep -E "^$1=" ./.env.production || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
POSTGRES_DB="$(env_get POSTGRES_DB)"; POSTGRES_USER="$(env_get POSTGRES_USER)"; OFFSITE_REMOTE="${OFFSITE_REMOTE:-$(env_get OFFSITE_REMOTE)}"
DB="${POSTGRES_DB:-umrah_connects}"; USER="${POSTGRES_USER:-umrah}"
[ -f "$DUMP.sha256" ] && sha256sum -c "$DUMP.sha256"
PSQL="docker compose --env-file .env.production exec -T postgres psql -v ON_ERROR_STOP=1 -U $USER"

case "$MODE" in
  verify)
    SCRATCH="restore_check_$(date +%s)"
    $PSQL -d postgres -c "CREATE DATABASE $SCRATCH"
    docker compose --env-file .env.production exec -T postgres pg_restore -U "$USER" -d "$SCRATCH" --no-owner < "$DUMP"
    $PSQL -d "$SCRATCH" -c "SELECT (SELECT count(*) FROM core.tenants) AS tenants, (SELECT count(*) FROM core.users) AS users, (SELECT count(*) FROM _prisma_migrations) AS migrations"
    $PSQL -d postgres -c "DROP DATABASE $SCRATCH"
    echo "restore verification ok"
    ;;
  replace)
    read -r -p "This REPLACES database $DB with $DUMP. Type the database name to continue: " answer
    [ "$answer" = "$DB" ] || { echo "aborted"; exit 1; }
    "$(dirname "$0")/pg-backup.sh"   # safety copy of the current state first
    docker compose --env-file .env.production stop api
    $PSQL -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid()"
    $PSQL -d postgres -c "DROP DATABASE $DB" -c "CREATE DATABASE $DB OWNER $USER"
    docker compose --env-file .env.production exec -T postgres pg_restore -U "$USER" -d "$DB" --no-owner < "$DUMP"
    docker compose --env-file .env.production up -d api
    echo "database replaced from $DUMP"
    ;;
  *) echo "mode must be verify or replace"; exit 1 ;;
esac
