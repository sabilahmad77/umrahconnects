#!/usr/bin/env bash
# Logical PostgreSQL backup (custom format) with retention and optional off-site copy.
#   BACKUP_DIR=/var/backups/umrah-connect  (default)
#   KEEP_DAILY=14 KEEP_WEEKLY=8
#   OFFSITE_REMOTE=r2:umrah-connect-backups  (optional; requires rclone configured for that remote)
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/umrah-connect}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
# Read single values from .env.production without executing it (values may contain shell metacharacters).
env_get() { { grep -E "^$1=" ./.env.production || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
POSTGRES_DB="$(env_get POSTGRES_DB)"; POSTGRES_USER="$(env_get POSTGRES_USER)"; OFFSITE_REMOTE="${OFFSITE_REMOTE:-$(env_get OFFSITE_REMOTE)}"
DB="${POSTGRES_DB:-umrah_connects}"; USER="${POSTGRES_USER:-umrah}"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/daily/${DB}-${STAMP}.dump"

docker compose --env-file .env.production exec -T postgres \
  pg_dump -U "$USER" -d "$DB" --format=custom --compress=9 --no-owner > "$OUT.partial"
# Integrity: the archive must list cleanly before it counts as a backup.
docker compose --env-file .env.production exec -T postgres pg_restore --list < "$OUT.partial" > /dev/null
mv "$OUT.partial" "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
chmod 600 "$OUT" "$OUT.sha256"

if [ "$(date -u +%u)" = "7" ]; then cp "$OUT" "$OUT.sha256" "$BACKUP_DIR/weekly/"; fi

ls -1t "$BACKUP_DIR"/daily/*.dump | tail -n +"$((KEEP_DAILY + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done
ls -1t "$BACKUP_DIR"/weekly/*.dump 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done

if [ -n "${OFFSITE_REMOTE:-}" ]; then
  rclone copy "$OUT" "$OFFSITE_REMOTE/daily/" && rclone copy "$OUT.sha256" "$OFFSITE_REMOTE/daily/"
fi
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
