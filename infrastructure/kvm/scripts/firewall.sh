#!/usr/bin/env bash
# Host firewall for the API server (run once as root). Only SSH, HTTP and HTTPS are reachable.
set -euo pipefail
SSH_PORT="${SSH_PORT:-22}"
ufw default deny incoming
ufw default allow outgoing
ufw limit "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
ufw status verbose
# Docker publishes ports through iptables directly; the compose file therefore binds
# PostgreSQL to 127.0.0.1 only and publishes nothing but Caddy's 80/443.
