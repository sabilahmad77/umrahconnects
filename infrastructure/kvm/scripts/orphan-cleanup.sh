#!/usr/bin/env bash
# O04 — scheduled orphaned stored-object cleanup (systemd umrah-orphan-cleanup.timer, daily).
# Runs the cleanup command of the deployed API image (platform/api/src/modules/storage/cleanup/
# orphan-cleanup.cli.ts, via `api-entrypoint cleanup-orphans`) in a one-off container.
#   ORPHAN_CLEANUP_MODE=report (default)  list what would be deleted, delete nothing
#   ORPHAN_CLEANUP_MODE=apply             delete unreferenced objects older than the grace period (7 days)
# The command refuses NODE_ENV=production without --allow-production, even for a report. Its exit codes
# (0 done, 1 error, 2 refused) become the unit's result; a failure raises an alert.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

MODE="${ORPHAN_CLEANUP_MODE:-$(env_get ORPHAN_CLEANUP_MODE)}"
case "${MODE:-report}" in
  report) set -- --allow-production ;;
  apply) set -- --apply --allow-production ;;
  *) die "ORPHAN_CLEANUP_MODE must be report or apply" ;;
esac
log "orphan cleanup: ${MODE:-report}"
compose run --rm --no-deps -T uc-api cleanup-orphans "$@"
