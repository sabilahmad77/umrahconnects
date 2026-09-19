#!/usr/bin/env bash
# Restore a backup made by pg-backup.sh.
#   scripts/pg-restore.sh <dump> verify    restore into a scratch database, print every table's row count,
#                                          check it against the archive, drop the scratch database. Safe:
#                                          the monthly restore drill.
#   scripts/pg-restore.sh <dump> replace   replace the live database: asks for the database name, takes a
#                                          local safety backup, stops the API, restores, re-applies the API's
#                                          runtime login and grants (R05, runtime-role.sql), restarts the API.
#                                          Everything written after the dump was taken is lost.
# The dump's .sha256 must sit next to it (download both from the off-site bucket). A dump that fails its
# checksum or cannot be listed is refused.
#   SKIP_SAFETY_BACKUP=1   replace only: continue when the current database cannot be dumped any more.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

DUMP="${1:?usage: pg-restore.sh <dump> verify|replace}"
MODE="${2:?usage: pg-restore.sh <dump> verify|replace}"
DB="$(env_get POSTGRES_DB)"
DB="${DB:-umrah_connects}"
DB_USER="$(env_get POSTGRES_USER)"
DB_USER="${DB_USER:-umrah}"
REPO="$(cd ../.. && pwd -P)"

[ -f "$DUMP" ] || die "no such dump: $DUMP"
[ -f "$DUMP.sha256" ] || die "missing $DUMP.sha256 — refusing to restore an unverified dump"
sha256_verify "$DUMP" || die "checksum mismatch for $DUMP — the file is damaged or not the original"
TOC="$(compose exec -T uc-postgres pg_restore --list < "$DUMP")" || die "pg_restore cannot read $DUMP"
EXPECTED_TABLES="$(printf '%s\n' "$TOC" | grep -c ' TABLE DATA ' || true)"
log "dump ok: checksum verified, archive lists $EXPECTED_TABLES tables"

psql_db() { # <database> [psql arguments…]
  local d="$1"
  shift
  compose exec -T uc-postgres psql -X -q -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$d" "$@"
}
# One "schema.table<TAB>rows" line per table of every application schema.
ROW_COUNTS_SQL="SELECT format('SELECT %L, count(*) FROM %I.%I', schemaname || '.' || tablename, schemaname, tablename)
  FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename \\gexec"

case "$MODE" in
  verify)
    SCRATCH="restore_check_$(date -u +%Y%m%d%H%M%S)"
    drop_scratch() { psql_db postgres -c "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null 2>&1 || warn "could not drop scratch database $SCRATCH — drop it by hand"; }
    trap drop_scratch EXIT
    psql_db postgres -c "CREATE DATABASE $SCRATCH"
    compose exec -T uc-postgres pg_restore -U "$DB_USER" -d "$SCRATCH" --no-owner --no-privileges --exit-on-error < "$DUMP"
    COUNTS="$(printf '%s\n' "$ROW_COUNTS_SQL" | psql_db "$SCRATCH" -At -F "$(printf '\t')")"
    printf '%s\n' "$COUNTS"
    RESTORED_TABLES="$(printf '%s\n' "$COUNTS" | grep -c . || true)"
    TOTAL_ROWS="$(printf '%s\n' "$COUNTS" | awk -F'\t' '{ s += $2 } END { print s + 0 }')"
    MIGRATIONS="$(psql_db "$SCRATCH" -At -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")"
    [ "$RESTORED_TABLES" -ge "$EXPECTED_TABLES" ] || die "only $RESTORED_TABLES tables were restored; the archive lists $EXPECTED_TABLES"
    [ "$MIGRATIONS" -gt 0 ] || die "the restored database has no applied migrations"
    log "restore verification ok: $RESTORED_TABLES tables, $TOTAL_ROWS rows, $MIGRATIONS applied migrations; scratch database dropped"
    ;;
  replace)
    printf 'This REPLACES database %s with %s.\nEverything written after that dump was taken is lost.\n' "$DB" "$DUMP"
    read -r -p "Type the database name to continue: " answer
    [ "$answer" = "$DB" ] || die "aborted"
    if [ "${SKIP_SAFETY_BACKUP:-}" = "1" ]; then
      warn "SKIP_SAFETY_BACKUP=1: no safety copy of the current state"
    else
      log "safety backup of the current state"
      ALLOW_LOCAL_ONLY_BACKUP=1 ./scripts/pg-backup.sh ||
        die "the safety backup failed; nothing was changed (set SKIP_SAFETY_BACKUP=1 only if the current database is unrecoverable)"
    fi
    compose stop uc-api
    psql_db postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid()" >/dev/null
    psql_db postgres -c "DROP DATABASE \"$DB\""
    psql_db postgres -c "CREATE DATABASE \"$DB\" OWNER \"$DB_USER\""
    # The dump's privileges name uc_app_runtime: create the runtime roles first (a new host has none yet) ...
    apply_runtime_role "$REPO" || die "could not prepare the runtime roles — uc-api stays stopped"
    compose exec -T uc-postgres pg_restore -U "$DB_USER" -d "$DB" --no-owner --exit-on-error < "$DUMP" ||
      die "restore failed — uc-api stays stopped; the safety backup is the newest file in the backup directory"
    # ... and re-apply the API login's grants on the restored schema (R05): without them the API cannot read
    # its tables; the API must never be pointed at the owner instead.
    apply_runtime_role "$REPO" || die "restored, but the runtime login's grants could not be applied — uc-api stays stopped"
    compose up -d uc-api
    log "database $DB replaced from $DUMP; runtime login re-applied; uc-api restarted"
    ;;
  *) die "mode must be verify or replace" ;;
esac
