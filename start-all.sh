#!/bin/bash
# Umrah Connect — one-command full-stack startup (dev).
# Starts: PostgreSQL, API (4000), Web (3000), Metro/Expo (8081), 2 Cloudflare tunnels.
# Usage:  ./start-all.sh          start everything missing
#         ./start-all.sh status   show service status
#         ./start-all.sh stop     stop app services (leaves PostgreSQL running)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
PG_BIN="/usr/local/opt/postgresql@15/bin"
PG_DATA="/usr/local/var/postgresql@15"
CRED='{"email":"admin@alharamain.sa","password":"Admin@1234","tenantId":"ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"}'

up()    { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }
status() {
  echo "Postgres : $($PG_BIN/pg_isready -q && echo UP || echo DOWN)"
  echo "API :4000: $(up 4000 && echo UP || echo DOWN)"
  echo "Web :3000: $(up 3000 && echo UP || echo DOWN)"
  echo "Metro:8081: $(up 8081 && echo UP || echo DOWN)"
  echo "Tunnels  : $(pgrep -f cloudflared | wc -l | tr -d ' ') cloudflared"
  echo "Web URL  : $(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf_web.log 2>/dev/null | head -1)"
  echo "API URL  : $(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf_api.log 2>/dev/null | head -1)"
}
if [ "${1:-}" = "status" ]; then status; exit 0; fi
if [ "${1:-}" = "stop" ]; then
  pkill -f "nest start" ; pkill -f "next dev" ; pkill -f "expo start" ; pkill -f cloudflared
  echo "App services stopped."; exit 0
fi

# 1. PostgreSQL (clears stale post-reboot lock safely)
if ! $PG_BIN/pg_isready -q 2>/dev/null; then
  if [ -f "$PG_DATA/postmaster.pid" ]; then
    LOCK_PID=$(head -1 "$PG_DATA/postmaster.pid")
    if ! ps -p "$LOCK_PID" -o comm= 2>/dev/null | grep -q postgres; then
      echo "Removing stale postgres lock (PID $LOCK_PID is not a postmaster)"
      rm "$PG_DATA/postmaster.pid"
    fi
  fi
  LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 $PG_BIN/pg_ctl -D "$PG_DATA" -l /tmp/pg.log start >/dev/null
  sleep 3
fi
echo "Postgres: $($PG_BIN/pg_isready)"

# 2. API
if ! up 4000; then
  (cd "$ROOT" && nohup pnpm --filter @umrah-connects/api dev > /tmp/api.log 2>&1 &) ; echo "API starting…"
fi
# 3. Web
if ! up 3000; then
  (cd "$ROOT" && nohup pnpm --filter @umrah-connects/web dev > /tmp/web.log 2>&1 &) ; echo "Web starting…"
fi
# 4. Metro/Expo
if ! up 8081; then
  (cd "$ROOT/apps/mobile" && nohup npx expo start --tunnel > /tmp/expo.log 2>&1 &) ; echo "Metro starting…"
fi
# 5. Tunnels
pgrep -f "cloudflared tunnel --url http://localhost:3000" >/dev/null || (nohup cloudflared tunnel --url http://localhost:3000 > /tmp/cf_web.log 2>&1 &)
pgrep -f "cloudflared tunnel --url http://localhost:4000" >/dev/null || (nohup cloudflared tunnel --url http://localhost:4000 > /tmp/cf_api.log 2>&1 &)

# 6. Wait + verify
printf "Waiting for API"; for i in $(seq 1 40); do
  curl -s -o /dev/null -X POST http://localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' -d "$CRED" -w '%{http_code}' 2>/dev/null | grep -q 200 && break
  printf "."; sleep 3
done; echo ""
printf "Waiting for Web"; for i in $(seq 1 40); do
  curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null | grep -q 200 && break
  printf "."; sleep 3
done; echo ""
sleep 4
status
