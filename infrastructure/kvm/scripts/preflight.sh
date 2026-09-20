#!/usr/bin/env bash
# Read-only checks before a deployment (scripts/deploy.sh runs it first). Run as the deploy user.
# Prints PASS/FAIL per check and exits 1 if anything fails. Never prints a setting's value.
#   BACKUP_DIR               default /var/backups/umrah-connect
#   PREFLIGHT_SKIP_OFFSITE=1 skip the off-site round trip (rehearsals without a bucket only)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib.sh

BACKUP_DIR="${BACKUP_DIR:-/var/backups/umrah-connect}"
failures=0
pass() { printf 'PASS %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}
check() { # <name> <command…>
  local name="$1"
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}

# 1. The env file: present, private, owned by the deploy user.
if [ ! -f "$ENV_FILE" ]; then
  fail "$ENV_FILE exists (copy .env.production.example and fill it in)"
  exit 1
fi
check "$ENV_FILE is owned by $(id -un)" [ "$(owner_of "$ENV_FILE")" = "$(id -un)" ]
check "$ENV_FILE is not readable by group/other (chmod 600)" [ "$(perms_group_other "$ENV_FILE")" = "------" ]

# 2. Proxy mode.
MODE_FILE="$(env_get COMPOSE_FILE)"
case "$MODE_FILE" in
  docker-compose.yml:docker-compose.bundled-proxy.yml)
    MODE=bundled
    pass "proxy mode: bundled (this stack's Caddy owns :80/:443)"
    ;;
  docker-compose.yml:docker-compose.shared-proxy.yml)
    MODE=shared
    pass "proxy mode: shared (an existing reverse proxy owns :80/:443)"
    NET="$(env_get SHARED_PROXY_NETWORK)"
    if [ -n "$NET" ] && docker network inspect "$NET" > /dev/null 2>&1; then
      pass "SHARED_PROXY_NETWORK is set and the Docker network exists"
    else
      fail "SHARED_PROXY_NETWORK is set and the Docker network exists"
    fi
    ;;
  *)
    MODE=unknown
    fail "COMPOSE_FILE selects a proxy mode (docker-compose.yml:docker-compose.bundled-proxy.yml or …shared-proxy.yml)"
    ;;
esac

# 3. Required values and their shape (names only in the output).
required="POSTGRES_PASSWORD APP_DB_USER APP_DB_PASSWORD JWT_SECRET API_DOMAIN WEB_URL CORS_ORIGINS OFFSITE_REMOTE"
[ "$MODE" = bundled ] && required="$required ACME_EMAIL"
for k in $required; do
  check "$k is set" [ -n "$(env_get "$k")" ]
done
check "POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)" \
  eval 'printf "%s" "$(env_get POSTGRES_PASSWORD)" | grep -Eq "^[A-Za-z0-9._~-]{24,}$"'
# R05: the API's login must be a dedicated role (runtime-role.sql refuses the owner; pg_ names are reserved).
check "APP_DB_USER is a plain role name (a-z 0-9 _), not POSTGRES_USER, postgres, uc_app_runtime or pg_*" \
  eval 'u="$(env_get APP_DB_USER)"; o="$(env_get POSTGRES_USER)"; printf "%s" "$u" | grep -Eq "^[a-z_][a-z0-9_]{0,62}$" &&
    [ "$u" != "${o:-umrah}" ] && [ "$u" != postgres ] && [ "$u" != uc_app_runtime ] && [ "${u#pg_}" = "$u" ]'
check "APP_DB_PASSWORD is URL-safe, at least 24 characters and not the owner password (openssl rand -hex 32)" \
  eval 'p="$(env_get APP_DB_PASSWORD)"; printf "%s" "$p" | grep -Eq "^[A-Za-z0-9._~-]{24,}$" && [ "$p" != "$(env_get POSTGRES_PASSWORD)" ]'
check "JWT_SECRET is at least 32 characters" eval '[ "$(env_get JWT_SECRET | wc -c)" -gt 32 ]'
check "no template placeholder (<…>) is left in a value" eval '! grep -E "^[A-Z0-9_]+=.*<[a-z-]+>" "$ENV_FILE" >/dev/null'
check "no setting points at Render (onrender.com / render.com) — Render is retired" \
  eval '! grep -Ei "^[A-Z0-9_]+=.*(onrender\.com|[./@]render\.com)" "$ENV_FILE" >/dev/null'

# 4. Off-site backups: the contract, then a real round trip.
OFFSITE="$(env_get OFFSITE_REMOTE)"
if [ -n "$OFFSITE" ]; then
  check "OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]" offsite_remote_valid "$OFFSITE"
  if [ "${PREFLIGHT_SKIP_OFFSITE:-}" = "1" ]; then
    printf 'SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)\n'
  else
    check "off-site destination is reachable (scripts/check-offsite.sh)" ./scripts/check-offsite.sh
  fi
fi

# 5. Compose model: valid, and nothing but the bundled proxy publishes a host port.
check "docker compose configuration is valid" eval 'compose config -q'
PUBLISHED="$(compose config --format json 2>/dev/null | python3 -c '
import json, sys
services = json.load(sys.stdin).get("services", {})
print(" ".join(sorted("%s:%s" % (name, p.get("target")) for name, s in services.items() for p in s.get("ports") or [])))
' 2>/dev/null || echo "?")"
case "$MODE" in
  bundled) check "only uc-caddy publishes host ports (80, 443)" [ "$PUBLISHED" = "uc-caddy:443 uc-caddy:443 uc-caddy:80" ] ;;
  shared) check "no service publishes a host port" [ -z "$PUBLISHED" ] ;;
esac

# 6. Backups directory (prepared by host-setup.sh) and disk space.
check "$BACKUP_DIR exists, is owned by $(id -un) and is private" \
  eval '[ -d "$BACKUP_DIR" ] && [ "$(owner_of "$BACKUP_DIR")" = "$(id -un)" ] && [ "$(perms_group_other "$BACKUP_DIR")" = "------" ]'
for dir in "$BACKUP_DIR" "$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /)"; do
  [ -e "$dir" ] || continue
  used="$(df -P "$dir" 2>/dev/null | awk 'NR == 2 { sub("%", "", $5); print $5 }')"
  check "disk holding $dir is below 85 % used (${used:-?} %)" [ "${used:-100}" -lt 85 ]
done

if [ "$failures" -gt 0 ]; then
  printf 'preflight: %d check(s) failed\n' "$failures"
  exit 1
fi
printf 'preflight: all checks passed\n'
