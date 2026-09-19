#!/usr/bin/env bash
# One-time (and repeatable) host preparation for the Umrah Connect stack. Run as root:
#   sudo infrastructure/kvm/scripts/host-setup.sh
# Idempotent: every run converges to the same owners and modes and changes nothing else on the host.
#   DEPLOY_USER=deploy                     the account that owns the checkout and runs deployments/backups
#   BACKUP_DIR=/var/backups/umrah-connect  local backups (daily/, weekly/), mode 700
#   STATE_DIR=/var/lib/umrah-connect       health-check state, mode 750
#   INSTALL_UNITS=1                        install/refresh the systemd units (they are enabled separately, README §2)
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_USER="${DEPLOY_USER:-deploy}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/umrah-connect}"
STATE_DIR="${STATE_DIR:-/var/lib/umrah-connect}"
INSTALL_UNITS="${INSTALL_UNITS:-1}"
KVM_DIR="$(pwd -P)"

[ "$(id -u)" = "0" ] || { echo "ERROR: run as root (sudo)" >&2; exit 1; }
id "$DEPLOY_USER" > /dev/null 2>&1 || { echo "ERROR: user $DEPLOY_USER does not exist (README §1 creates it)" >&2; exit 1; }
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"
if ! id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
  echo "WARNING: $DEPLOY_USER is not in the docker group; deployments and backups need it (usermod -aG docker $DEPLOY_USER)" >&2
fi

# install -d creates missing directories; chown/chmod converge existing ones.
ensure_dir() { # <path> <mode>
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m "$2" "$1"
  chown "$DEPLOY_USER:$DEPLOY_GROUP" "$1"
  chmod "$2" "$1"
  echo "ok   $1 ($DEPLOY_USER:$DEPLOY_GROUP $2)"
}
ensure_dir "$BACKUP_DIR" 0700
ensure_dir "$BACKUP_DIR/daily" 0700
ensure_dir "$BACKUP_DIR/weekly" 0700
ensure_dir "$STATE_DIR" 0750
# Dumps written before this script existed may have other owners or modes.
find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.sha256' \) -exec chown "$DEPLOY_USER:$DEPLOY_GROUP" {} + -exec chmod 0600 {} +

if [ -f .env.production ]; then
  chown "$DEPLOY_USER:$DEPLOY_GROUP" .env.production
  chmod 0600 .env.production
  echo "ok   $KVM_DIR/.env.production ($DEPLOY_USER 0600)"
else
  echo "note $KVM_DIR/.env.production does not exist yet (copy .env.production.example)"
fi
for f in scripts/*.sh api-entrypoint.sh; do [ "$f" = scripts/lib.sh ] || chmod 0755 "$f"; done

if [ "$INSTALL_UNITS" = "1" ]; then
  if [ "$KVM_DIR" != "/opt/umrah-connect/infrastructure/kvm" ] || [ "$DEPLOY_USER" != "deploy" ]; then
    echo "WARNING: the units assume /opt/umrah-connect and user deploy; adjust them with 'systemctl edit' drop-ins" >&2
  fi
  if [ ! -d /run/systemd/system ]; then
    echo "note systemd is not running here; units not installed"
  else
    changed=0
    for unit in systemd/*.service systemd/*.timer; do
      dest="/etc/systemd/system/$(basename "$unit")"
      if ! cmp -s "$unit" "$dest"; then
        install -o root -g root -m 0644 "$unit" "$dest"
        changed=1
        echo "ok   installed $dest"
      fi
    done
    [ "$changed" = "1" ] && systemctl daemon-reload
    echo "ok   systemd units current (enable the timers after the first deployment — README §2)"
  fi
fi
echo "host setup complete"
