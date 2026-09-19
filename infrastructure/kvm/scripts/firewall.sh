#!/usr/bin/env bash
# Host firewall (ufw) for the API server. Run as root:
#   sudo infrastructure/kvm/scripts/firewall.sh           check only: show what is open, change nothing
#   sudo FIREWALL_APPLY=1 infrastructure/kvm/scripts/firewall.sh
#       allow SSH (rate-limited), 80/tcp, 443/tcp and 443/udp. If ufw is inactive it also sets
#       "deny incoming" and enables ufw — which blocks every other port, including other projects'
#       services on a shared host, so read the check output first.
# Existing rules and defaults of an active ufw are never removed or changed.
# Docker-published ports bypass ufw (Docker writes its own iptables rules). This stack therefore publishes
# nothing but the bundled proxy's 80/443; PostgreSQL and the API are never published.
set -euo pipefail
SSH_PORT="${SSH_PORT:-22}"

[ "$(id -u)" = "0" ] || { echo "ERROR: run as root (sudo)" >&2; exit 1; }
command -v ufw > /dev/null || { echo "ERROR: ufw is not installed (apt install ufw)" >&2; exit 1; }

echo "== ufw status"
ufw status verbose || true
if command -v docker > /dev/null; then
  echo "== Docker ports published on all interfaces (these bypass ufw)"
  docker ps --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0:|\[::\]:' || echo "(none)"
  if docker ps --format '{{.Ports}}' | grep -Eq '(0\.0\.0\.0|\[::\]):5432->'; then
    echo "WARNING: some container publishes PostgreSQL (5432) on a public interface" >&2
  fi
fi

if [ "${FIREWALL_APPLY:-}" != "1" ]; then
  echo "check only; re-run with FIREWALL_APPLY=1 to add the rules"
  exit 0
fi

ufw limit "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
if ufw status | grep -q "Status: active"; then
  echo "ufw was already active: rules added, defaults left as they were"
else
  ufw default deny incoming
  ufw default allow outgoing
  ufw --force enable
fi
ufw status verbose
