#!/usr/bin/env bash
# Static validation of the KVM blueprint. Needs no server and no secret; never reads a real .env.production.
# Used by .github/workflows/infra-ci.yml and for local evidence.
#   1. shell syntax of every script (+ shellcheck when installed)
#   2. docker compose config for both proxy modes, with a generated throwaway env file
#   3. the published-port policy of both modes (bundled: only uc-caddy 80/443; shared: nothing)
#   4. caddy validate of the Caddyfile (caddy:2.8 container) when Docker is available
#   5. systemd-analyze verify of the units when systemd is available
#   VALIDATE_NAME_PREFIX  name prefix for the throwaway Caddy container (default "uc")
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
KVM="$(pwd -P)"
REPO="$(cd ../.. && pwd -P)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0
step() { printf '\n== %s\n' "$1"; }
result() { # <status> <name>
  if [ "$1" = 0 ]; then printf 'PASS %s\n' "$2"; else
    printf 'FAIL %s\n' "$2"
    failures=$((failures + 1))
  fi
}

step "shell syntax"
for f in scripts/*.sh "$REPO/scripts/uptime-check.sh"; do
  bash -n "$f"
  result $? "bash -n ${f#"$REPO"/}"
done
sh -n api-entrypoint.sh
result $? "sh -n api-entrypoint.sh"
if command -v shellcheck > /dev/null 2>&1; then
  shellcheck -x -S warning scripts/*.sh api-entrypoint.sh "$REPO/scripts/uptime-check.sh"
  result $? "shellcheck (warning and above)"
else
  printf 'SKIP shellcheck (not installed)\n'
fi

step "compose configuration (both proxy modes)"
cp -R "$KVM" "$WORK/kvm"
rm -f "$WORK/kvm/.env.production"
sed -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=ci0123456789abcdef0123456789abcdef/' \
  -e 's/^ACME_EMAIL=$/ACME_EMAIL=ops@example.com/' \
  -e 's/^JWT_SECRET=$/JWT_SECRET=ci0123456789abcdef0123456789abcdef0123456789/' \
  "$KVM/.env.production.example" > "$WORK/kvm/.env.production"
published() { # prints "service:target …" for every published port
  docker compose --env-file .env.production config --format json | python3 -c '
import json, sys
services = json.load(sys.stdin).get("services", {})
print(" ".join(sorted("%s:%s" % (n, p.get("target")) for n, s in services.items() for p in s.get("ports") or [])))'
}
(
  cd "$WORK/kvm" || exit 1
  docker compose --env-file .env.production config -q
) > "$WORK/bundled.log" 2>&1
result $? "docker compose config (bundled proxy)"
ports="$(cd "$WORK/kvm" && published 2>/dev/null)"
if [ "$ports" = "uc-caddy:443 uc-caddy:443 uc-caddy:80" ]; then rc=0; else rc=1; fi
result "$rc" "bundled mode publishes only uc-caddy 80/443 [${ports}]"
sed -i.bak -e 's/^COMPOSE_FILE=.*/COMPOSE_FILE=docker-compose.yml:docker-compose.shared-proxy.yml/' "$WORK/kvm/.env.production"
(cd "$WORK/kvm" && ! docker compose --env-file .env.production config -q > /dev/null 2>&1)
result $? "shared mode without SHARED_PROXY_NETWORK is refused"
echo "SHARED_PROXY_NETWORK=ci-shared-proxy" >> "$WORK/kvm/.env.production"
(cd "$WORK/kvm" && docker compose --env-file .env.production config -q) > "$WORK/shared.log" 2>&1
result $? "docker compose config (shared proxy)"
ports="$(cd "$WORK/kvm" && published 2>/dev/null)"
if [ -z "$ports" ]; then rc=0; else rc=1; fi
result "$rc" "shared mode publishes no host port [${ports}]"
cat "$WORK/bundled.log" "$WORK/shared.log"

step "Caddyfile"
if command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
  docker run --rm --name "${VALIDATE_NAME_PREFIX:-uc}-caddy-validate-$$" --network none \
    -e API_DOMAIN=api.example.com -e ACME_EMAIL=ops@example.com \
    -v "$KVM/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.8 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  result $? "caddy validate (caddy:2.8)"
else
  printf 'SKIP caddy validate (no Docker)\n'
fi

step "systemd units"
if command -v systemd-analyze > /dev/null 2>&1; then
  mkdir -p "$WORK/units"
  for u in systemd/*; do sed -e "s#/opt/umrah-connect#$REPO#g" -e "s#^User=deploy#User=$(id -un)#" "$u" > "$WORK/units/$(basename "$u")"; done
  # Template instances need a concrete name to be verified.
  cp "$WORK/units/umrah-alert@.service" "$WORK/units/umrah-alert@umrah-backup.service.service"
  (cd "$WORK/units" && SYSTEMD_LOG_LEVEL=warning systemd-analyze verify ./*.timer ./umrah-backup.service ./umrah-healthcheck.service \
    ./umrah-orphan-cleanup.service ./umrah-alert@umrah-backup.service.service)
  result $? "systemd-analyze verify"
else
  printf 'SKIP systemd-analyze (not available)\n'
fi

printf '\nvalidate-blueprint: %s\n' "$([ "$failures" = 0 ] && echo "all checks passed" || echo "$failures check(s) FAILED")"
[ "$failures" = 0 ]
