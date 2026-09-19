#!/usr/bin/env bash
# Logical PostgreSQL backup: pg_dump (custom format) → integrity check → SHA-256 → retention → off-site copy.
#   BACKUP_DIR                 default /var/backups/umrah-connect. Created once by scripts/host-setup.sh
#                              (owner: the deploy user, mode 700); this script never takes over or loosens it.
#   KEEP_DAILY=14 KEEP_WEEKLY=8
#   OFFSITE_REMOTE             from .env.production (or the environment): rclone "<remote>:<bucket>[/<prefix>]".
#                              Required in production; verify it with scripts/check-offsite.sh.
#   ALLOW_LOCAL_ONLY_BACKUP=1  rehearsals, pre-launch and pg-restore.sh's safety copy only: skip the off-site copy.
# Exit: 0 ok · 1 no new backup · 3 the local backup is complete but the off-site copy is missing or failed
# (systemd reports both as failures, which raises an alert).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

BACKUP_DIR="${BACKUP_DIR:-/var/backups/umrah-connect}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
DB="$(env_get POSTGRES_DB)"
DB="${DB:-umrah_connects}"
DB_USER="$(env_get POSTGRES_USER)"
DB_USER="${DB_USER:-umrah}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-$(env_get OFFSITE_REMOTE)}"
ME="$(id -un)"

umask 077
if [ ! -d "$BACKUP_DIR" ]; then
  # Only possible where the parent is writable (rehearsals); on the server root prepares it.
  mkdir -p "$BACKUP_DIR" 2>/dev/null || die "backup directory $BACKUP_DIR is missing and $ME cannot create it — run 'sudo scripts/host-setup.sh' once"
fi
[ "$(owner_of "$BACKUP_DIR")" = "$ME" ] || die "$BACKUP_DIR is owned by $(owner_of "$BACKUP_DIR"), not $ME — run 'sudo scripts/host-setup.sh'"
[ "$(perms_group_other "$BACKUP_DIR")" = "------" ] || chmod 700 "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
[ -w "$BACKUP_DIR/daily" ] && [ -w "$BACKUP_DIR/weekly" ] || die "$BACKUP_DIR/daily or weekly is not writable by $ME"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/daily/${DB}-${STAMP}.dump"
trap 'rm -f "$OUT.partial"' EXIT

log "dumping database $DB"
compose exec -T uc-postgres pg_dump -U "$DB_USER" -d "$DB" --format=custom --compress=9 --no-owner > "$OUT.partial"
# Integrity: the archive must list cleanly and contain table data before it counts as a backup.
TOC="$(compose exec -T uc-postgres pg_restore --list < "$OUT.partial")" || die "integrity check failed: pg_restore cannot read the new archive"
TABLES="$(printf '%s\n' "$TOC" | grep -c ' TABLE DATA ' || true)"
[ "$TABLES" -gt 0 ] || die "integrity check failed: the archive contains no table data"
mv "$OUT.partial" "$OUT"
sha256_write "$OUT"
chmod 600 "$OUT" "$OUT.sha256"
log "local backup ok: $OUT ($(du -h "$OUT" | cut -f1), $TABLES tables, sha256 recorded)"

WEEKLY=""
if [ "$(date -u +%u)" = "7" ]; then
  cp -p "$OUT" "$OUT.sha256" "$BACKUP_DIR/weekly/"
  WEEKLY="yes"
fi

# Retention. The listing is wrapped so an empty directory is not an error under pipefail.
prune() { # <dir> <keep>
  { ls -1t "$1"/*.dump 2>/dev/null || true; } | tail -n +"$(($2 + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

offsite_failed() {
  printf 'OFFSITE BACKUP FAILED: %s\n' "$*" >&2
  printf 'The local backup %s is complete; only its off-site copy is missing.\n' "$OUT" >&2
  exit 3
}
if [ -z "$OFFSITE_REMOTE" ]; then
  if [ "${ALLOW_LOCAL_ONLY_BACKUP:-}" = "1" ]; then
    warn "OFFSITE_REMOTE is not set; ALLOW_LOCAL_ONLY_BACKUP=1 accepts a local-only backup (rehearsals only)"
    exit 0
  fi
  offsite_failed "OFFSITE_REMOTE is not set in $ENV_FILE. A backup kept only on this server's disk is not acceptable in production (README: Backups and restore)."
fi
offsite_remote_valid "$OFFSITE_REMOTE" || offsite_failed "OFFSITE_REMOTE is not of the form <rclone-remote>:<bucket>[/<prefix>]"
command -v rclone >/dev/null 2>&1 || offsite_failed "rclone is not installed (apt install rclone)"

DEST="${OFFSITE_REMOTE%/}"
NAME="$(basename "$OUT")"
{ rclone copyto "$OUT" "$DEST/daily/$NAME" && rclone copyto "$OUT.sha256" "$DEST/daily/$NAME.sha256"; } ||
  offsite_failed "rclone could not upload to $DEST (diagnose with scripts/check-offsite.sh)"
REMOTE_SIZE="$(rclone lsf --files-only --format s "$DEST/daily/$NAME" 2>/dev/null || true)"
LOCAL_SIZE="$(wc -c < "$OUT" | tr -d ' ')"
[ "$REMOTE_SIZE" = "$LOCAL_SIZE" ] || offsite_failed "the off-site copy reports ${REMOTE_SIZE:-no} bytes, expected $LOCAL_SIZE"
if [ -n "$WEEKLY" ]; then
  { rclone copyto "$DEST/daily/$NAME" "$DEST/weekly/$NAME" && rclone copyto "$DEST/daily/$NAME.sha256" "$DEST/weekly/$NAME.sha256"; } ||
    offsite_failed "the weekly off-site copy failed"
fi
log "off-site copy ok: $DEST/daily/$NAME ($LOCAL_SIZE bytes verified)"
