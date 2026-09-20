# shellcheck shell=bash
# Shared helpers for the KVM operations scripts. Sourced (never executed) after `cd infrastructure/kvm`.
# Portable across GNU (the Ubuntu server) and BSD userlands (local rehearsals on macOS), bash >= 3.2.
# Never prints the value of a setting: callers pass names, helpers answer with names only.

ENV_FILE=".env.production"

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# Read one value from .env.production without executing the file (values may contain shell
# metacharacters). The last assignment wins, surrounding double quotes are removed.
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

# docker compose bound to the production env file (COMPOSE_FILE inside it selects the proxy mode).
compose() { docker compose --env-file "$ENV_FILE" "$@"; }

# SHA-256 helpers. The .sha256 file names the dump by basename, so a copy can be verified wherever it
# lives (weekly directory, a download from the off-site bucket, another server).
if command -v sha256sum >/dev/null 2>&1; then SHA256="sha256sum"; else SHA256="shasum -a 256"; fi
sha256_write() { # <file>
  (cd "$(dirname "$1")" && $SHA256 "$(basename "$1")" > "$(basename "$1").sha256")
}
sha256_verify() { # <file>  (needs <file>.sha256 next to it)
  (cd "$(dirname "$1")" && $SHA256 -c --quiet "$(basename "$1").sha256")
}

# OFFSITE_REMOTE contract: "<rclone remote>:<bucket>[/<prefix>]". The remote is a name from rclone.conf;
# the bucket follows R2/S3 naming (3–63 characters of a-z 0-9 and "-", starting and ending alphanumeric);
# the optional prefix uses A-Z a-z 0-9 . _ - and "/" separators.
offsite_remote_valid() {
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9_][A-Za-z0-9_-]*:[a-z0-9][a-z0-9-]{1,61}[a-z0-9](/[A-Za-z0-9._-]+)*/?$'
}

# Permission bits for group and other ("------" means private). Portable replacement for stat -c/-f.
perms_group_other() { ls -ld "$1" | cut -c5-10; }
owner_of() { ls -ld "$1" | awk '{print $3}'; }

# R05: create/update the API's database login (APP_DB_USER, a member of uc_app_runtime) and re-apply the runtime
# grants, as the database owner inside uc-postgres (platform/api/prisma/rls/runtime-role.sql, idempotent). The
# password reaches psql only through the environment of this one exec (never a command line, never printed).
# Fails unless the login ends up not superuser, not BYPASSRLS and owning nothing.   apply_runtime_role <repo-root>
apply_runtime_role() {
  local db db_user login out last
  db="$(env_get POSTGRES_DB)"
  db_user="$(env_get POSTGRES_USER)"
  login="$(env_get APP_DB_USER)"
  [ -n "$login" ] && [ -n "$(env_get APP_DB_PASSWORD)" ] || {
    warn "APP_DB_USER and APP_DB_PASSWORD must be set in $ENV_FILE"
    return 1
  }
  out="$(UC_RUNTIME_LOGIN="$login" UC_RUNTIME_PASSWORD="$(env_get APP_DB_PASSWORD)" \
    compose exec -T -e UC_RUNTIME_LOGIN -e UC_RUNTIME_PASSWORD uc-postgres \
    psql -X -q -At -v ON_ERROR_STOP=1 -U "${db_user:-umrah}" -d "${db:-umrah_connects}" -f - \
    < "$1/platform/api/prisma/rls/runtime-role.sql")" || {
    warn "runtime role script failed for login $login"
    return 1
  }
  last="$(printf '%s\n' "$out" | tail -n 1)"
  [ "$last" = "$login|f|f|f" ] || {
    warn "runtime login check failed: expected '$login|f|f|f' (not superuser, no BYPASSRLS, owns nothing), got '$last'"
    return 1
  }
  log "runtime login $login: not superuser, no BYPASSRLS, owns nothing"
}
