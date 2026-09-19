#!/usr/bin/env bash
# Host-side health check (systemd umrah-healthcheck.timer, every minute). Independent of DNS and of any
# external monitor: containers, the API inside its container, this host's HTTPS edge, disk space and
# backup freshness. Raises an alert through scripts/alert.sh after ALERT_AFTER consecutive failed runs,
# repeats it every ALERT_REPEAT_MINUTES while failing, and sends one recovery message.
#   STATE_DIR=/var/lib/umrah-connect   BACKUP_DIR=/var/backups/umrah-connect
#   ALERT_AFTER=2  ALERT_REPEAT_MINUTES=60  DISK_ALERT_PERCENT=85  BACKUP_MAX_AGE_HOURS=26
#   HEALTH_EDGE_ADDRESS=127.0.0.1   where this host's HTTPS edge answers for API_DOMAIN ("" skips the edge check)
#   HEALTH_EDGE_PORT=443
#   UPTIME_CACERT                   passed through to the edge check (private CA in rehearsals)
# Exit 0 healthy, 1 unhealthy (the unit then shows as failed).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib.sh

STATE_DIR="${STATE_DIR:-/var/lib/umrah-connect}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/umrah-connect}"
ALERT_AFTER="${ALERT_AFTER:-2}"
ALERT_REPEAT_MINUTES="${ALERT_REPEAT_MINUTES:-60}"
DISK_ALERT_PERCENT="${DISK_ALERT_PERCENT:-85}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
EDGE="${HEALTH_EDGE_ADDRESS-127.0.0.1}"
EDGE_PORT="${HEALTH_EDGE_PORT:-443}"
REPO_SCRIPTS="$(cd ../../scripts && pwd -P)"

problems=""
ok() { printf 'ok   %s\n' "$1"; }
bad() {
  printf 'FAIL %s\n' "$1"
  problems="$problems- $1
"
}

# 1. Containers: running, and healthy where a health check exists.
services="uc-postgres uc-api"
case "$(env_get COMPOSE_FILE)" in *bundled-proxy*) services="$services uc-caddy" ;; esac
for svc in $services; do
  id="$(compose ps -q "$svc" 2> /dev/null | head -n 1)"
  if [ -z "$id" ]; then
    bad "$svc: no container"
    continue
  fi
  st="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$id" 2> /dev/null)"
  case "$st" in
    "running healthy" | "running no-healthcheck") ok "$svc: $st" ;;
    *) bad "$svc: ${st:-unknown}" ;;
  esac
done

# 2. The API itself, from inside its container (no proxy, no DNS).
if compose exec -T uc-api curl -fsS -m 5 http://127.0.0.1:4000/api/v1/health/ready > /dev/null 2>&1; then
  ok "uc-api readiness (in container)"
else
  bad "uc-api readiness (in container) failed"
fi

# 3. This host's HTTPS edge (bundled Caddy or the shared proxy) for API_DOMAIN, including the certificate.
DOMAIN="$(env_get API_DOMAIN)"
if [ -n "$EDGE" ] && [ -n "$DOMAIN" ]; then
  if out="$(UPTIME_API_URL="https://$DOMAIN:$EDGE_PORT" UPTIME_WEB_URL="" UPTIME_CONNECT_TO="$EDGE" UPTIME_ATTEMPTS=2 \
    UPTIME_RETRY_DELAY=3 UPTIME_TIMEOUT=10 "$REPO_SCRIPTS/uptime-check.sh" 2>&1)"; then
    ok "HTTPS edge for $DOMAIN via $EDGE"
  else
    bad "HTTPS edge for $DOMAIN via $EDGE: $(printf '%s\n' "$out" | grep '^FAIL' | tr '\n' ';')"
  fi
fi

# 4. Disk space where the database, the images and the backups live.
for dir in "$BACKUP_DIR" "$(docker info --format '{{.DockerRootDir}}' 2> /dev/null)"; do
  [ -n "$dir" ] && [ -e "$dir" ] || continue
  used="$(df -P "$dir" | awk 'NR == 2 { sub("%", "", $5); print $5 }')"
  if [ "${used:-100}" -lt "$DISK_ALERT_PERCENT" ]; then ok "disk $dir ${used}%"; else bad "disk $dir ${used:-?}% used (limit $DISK_ALERT_PERCENT%)"; fi
done

# 5. A local backup newer than BACKUP_MAX_AGE_HOURS (the nightly timer ran and succeeded).
if [ -n "$(find "$BACKUP_DIR/daily" -maxdepth 1 -name '*.dump' -mmin -$((BACKUP_MAX_AGE_HOURS * 60)) 2> /dev/null | head -n 1)" ]; then
  ok "backup newer than ${BACKUP_MAX_AGE_HOURS}h"
else
  bad "no backup newer than ${BACKUP_MAX_AGE_HOURS}h in $BACKUP_DIR/daily"
fi

# Alert state: "<consecutive failures> <epoch of last alert> <alerted 0|1>".
mkdir -p "$STATE_DIR"
STATE="$STATE_DIR/healthcheck.state"
fails=0 last=0 alerted=0
if [ -f "$STATE" ]; then read -r fails last alerted < "$STATE" || true; fi
fails="${fails:-0}"
last="${last:-0}"
alerted="${alerted:-0}"
now="$(date +%s)"
if [ -z "$problems" ]; then
  [ "$alerted" = "1" ] && ./scripts/alert.sh "RECOVERED: all health checks pass again"
  echo "0 0 0" > "$STATE"
  exit 0
fi
fails=$((fails + 1))
if [ "$fails" -ge "$ALERT_AFTER" ] && { [ "$alerted" = "0" ] || [ $((now - last)) -ge $((ALERT_REPEAT_MINUTES * 60)) ]; }; then
  ./scripts/alert.sh "DOWN: $fails consecutive failed health checks" "$problems"
  last="$now"
  alerted=1
fi
echo "$fails $last $alerted" > "$STATE"
exit 1
