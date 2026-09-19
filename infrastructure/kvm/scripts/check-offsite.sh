#!/usr/bin/env bash
# Reachability check for the off-site backup destination (OFFSITE_REMOTE in .env.production):
# format, rclone and its remote for this user, then a write → read-back → delete round trip under
# <destination>/.preflight/. Run it as the deploy user after configuring rclone, and after any
# credential rotation. Prints names only, never credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

OFFSITE_REMOTE="${OFFSITE_REMOTE:-$(env_get OFFSITE_REMOTE)}"
[ -n "$OFFSITE_REMOTE" ] || die "OFFSITE_REMOTE is not set in $ENV_FILE (required in production)"
offsite_remote_valid "$OFFSITE_REMOTE" || die "OFFSITE_REMOTE must look like <rclone-remote>:<bucket>[/<prefix>], e.g. r2-backups:umrah-connect-db-backups/production"
command -v rclone >/dev/null 2>&1 || die "rclone is not installed (apt install rclone)"

REMOTE_NAME="${OFFSITE_REMOTE%%:*}"
rclone listremotes | grep -qx "$REMOTE_NAME:" ||
  die "rclone has no remote named '$REMOTE_NAME' for $(id -un) (config file: $(rclone config file | tail -n 1))"

DEST="${OFFSITE_REMOTE%/}"
PROBE="$DEST/.preflight/$(hostname | cut -d. -f1)-$(date -u +%Y%m%dT%H%M%SZ).txt"
printf 'umrah-connect off-site probe %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | rclone rcat "$PROBE" ||
  die "cannot write to $DEST (credentials, bucket name, token scope, or no_check_bucket missing for a bucket-scoped token)"
[ -n "$(rclone cat "$PROBE" 2>/dev/null)" ] || die "wrote to $DEST but could not read the probe back"
rclone deletefile "$PROBE" || warn "could not delete the probe $PROBE; remove it or let a lifecycle rule expire it"
log "off-site destination reachable: $DEST (write, read-back and delete verified)"
