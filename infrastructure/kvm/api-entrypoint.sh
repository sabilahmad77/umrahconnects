#!/bin/sh
# Umrah Connect API container entrypoint.
#   serve    — start the API (default). Never migrates.
#   migrate  — apply committed Prisma migrations (prisma migrate deploy), then exit.
#   status   — show migration status, then exit.
#   bootstrap-admin — create/repair the platform Super Admin from PLATFORM_ADMIN_* env, then exit.
set -eu
cd /app/platform/api
case "${1:-serve}" in
  serve)
    exec node dist/src/main.js
    ;;
  migrate)
    exec ./node_modules/.bin/prisma migrate deploy
    ;;
  status)
    exec ./node_modules/.bin/prisma migrate status
    ;;
  bootstrap-admin)
    exec node dist/prisma/scripts/bootstrap-platform-admin.js
    ;;
  sync-rbac)
    exec node dist/prisma/scripts/sync-rbac.js
    ;;
  *)
    exec "$@"
    ;;
esac
