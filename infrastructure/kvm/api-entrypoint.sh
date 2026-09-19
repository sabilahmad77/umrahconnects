#!/bin/sh
# Umrah Connect API container entrypoint.
#   serve            start the API (default). Never migrates.
#   migrate          apply committed Prisma migrations (prisma migrate deploy), then exit.
#   status           show migration status, then exit.
#   check-config     run the production configuration check without starting the server
#                    (same rules as boot, src/bootstrap/env.validation.ts); exit 1 on any problem.
#   bootstrap-admin  create/repair the platform Super Admin from PLATFORM_ADMIN_* env, then exit.
#   sync-rbac        sync the capability catalogue and system roles, then exit.
#   cleanup-orphans  O04 orphaned stored-object cleanup (storage/cleanup/orphan-cleanup.cli.ts);
#                    remaining arguments are passed through (--apply, --allow-production, --grace-hours=N …).
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
  check-config)
    if [ "${NODE_ENV:-}" != "production" ]; then
      echo "check-config: NODE_ENV is not production; nothing to check" >&2
      exit 1
    fi
    exec node -e '
      const { productionConfigProblems } = require("./dist/src/bootstrap/env.validation");
      const problems = productionConfigProblems(process.env);
      if (problems.length) {
        console.error("Unsafe production configuration:\n  - " + problems.join("\n  - "));
        process.exit(1);
      }
      console.log("production configuration ok");
    '
    ;;
  bootstrap-admin)
    exec node dist/prisma/scripts/bootstrap-platform-admin.js
    ;;
  sync-rbac)
    exec node dist/prisma/scripts/sync-rbac.js
    ;;
  cleanup-orphans)
    shift
    exec node dist/src/modules/storage/cleanup/orphan-cleanup.cli.js "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
