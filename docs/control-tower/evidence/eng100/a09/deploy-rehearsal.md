# deploy.sh rehearsal (build → check-config → backup → migrate → start → health → tag, and rollback)

Disposable setup: a bare repository `~/.uc-a09-rehearsal/origin.git` played GitHub (its `main` = this branch, plus
rehearsal-only commits), and a clone of it played `/opt/umrah-connect`. Compose project `uc-a09-deploy`, Caddy on
127.0.0.1:18409/18443, throwaway `.env.production` with no Render value, `OFFSITE_REMOTE` set but rclone absent (to
exercise the "local backup OK, off-site failed" path), `PREFLIGHT_SKIP_OFFSITE=1`. Six fake release tags pointed at
an unrelated image to exercise retention. Docker build output is filtered out below. Everything was removed afterwards.

Findings fixed on this branch while rehearsing:
- e5ed184 — the pre-deploy backup ran `compose exec uc-postgres` without starting the database ("service uc-postgres is
  not running"), and a fresh empty database would have aborted the first deployment.
- cbee343 — after checking out the new commit, bash kept executing the old copy of deploy.sh; it now re-executes the
  deployed commit's script.
- 0b798eb — the rollback returned before the previous release was ready and left the checkout on the failed commit.

Verified: first deployment on an empty database (no backup needed, 3 migrations); routine deployment with a backup
(off-site failure → warning, deploy continues) and `:current`/`:previous` rotation; retention keeps five release
tags; a release whose health check fails is rolled back to `:previous`, which is healthy, and the checkout returns to
that release; a commit that is not on `origin/main` is refused.

```text
$ COMPOSE_PROJECT_NAME=uc-a09-deploy BACKUP_DIR=$R/backups PREFLIGHT_SKIP_OFFSITE=1 heavy ./scripts/deploy.sh cd3dd419c78fdaadfcb786fb8ee7018bf52a152c   # deploy #1
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
FAIL /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
preflight: 1 check(s) failed
[exit 1]
# the backup directory is prepared as host-setup.sh would (install -d -m 0700, owner = deploying user); re-run
$ COMPOSE_PROJECT_NAME=uc-a09-deploy BACKUP_DIR=$R/backups PREFLIGHT_SKIP_OFFSITE=1 heavy ./scripts/deploy.sh cd3dd419c78fdaadfcb786fb8ee7018bf52a152c   # deploy #1
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (45 %)
preflight: all checks passed
13:08:27Z building umrah-connect-api:cd3dd419c78f
running python rtupdate hooks for python3.11...
running python post-rtupdate hooks for python3.11...
update-alternatives: using /usr/bin/g++ to provide /usr/bin/c++ (c++) in auto mode
   ╭──────────────────────────────────────────────────────────────────╮
   │                                                                  │
   │                Update available! 9.12.0 → 12.4.2.                │
   │   Changelog: https://github.com/pnpm/pnpm/releases/tag/v12.4.2   │
   │         Run "corepack install -g pnpm@12.4.2" to update.         │
   │                                                                  │
   │         Follow @pnpmjs for updates: https://x.com/pnpmjs         │
   │                                                                  │
   ╰──────────────────────────────────────────────────────────────────╯
Prisma schema loaded from prisma/schema.prisma
production configuration ok
13:12:46Z pre-deploy backup
13:12:47Z dumping database uc_a09_deploy
service "uc-postgres" is not running
ERROR: pre-deploy backup failed; nothing was changed
[exit 1]
# deploy.sh fixed (e5ed184: start the DB before the backup, empty first DB; cbee343: re-exec the deployed commit's script); the
# rehearsal checkout was updated to it as an operator would before the first deploy with this logic
$ COMPOSE_PROJECT_NAME=uc-a09-deploy BACKUP_DIR=$R/backups PREFLIGHT_SKIP_OFFSITE=1 heavy ./scripts/deploy.sh cbee343f515bcd8904efb11ef7f4c1980df7fb56   # deploy #1
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (45 %)
preflight: all checks passed
13:14:14Z building umrah-connect-api:cbee343f515b
production configuration ok
13:14:29Z database
13:14:39Z database uc_a09_deploy is empty (first deployment): nothing to back up yet
13:14:39Z migrating
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_deploy", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"
3 migrations found in prisma/migrations
Applying migration `20260917000000_baseline`
Applying migration `20260917154700_auth_hardening_platform_role`
Applying migration `20260917160539_payments_checkout_stripe`
migrations/
All migrations have been successfully applied.
13:14:41Z starting umrah-connect-api:cbee343f515b
13:15:17Z deployed cbee343f515bcd8904efb11ef7f4c1980df7fb56
[exit 0]
$ heavy ./scripts/deploy.sh 36445209b7636e82d883df4497f15c59edc44426   # deploy #2 (normal release)
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (45 %)
preflight: all checks passed
13:16:48Z building umrah-connect-api:36445209b763
production configuration ok
13:17:15Z database
13:17:16Z pre-deploy backup
13:17:16Z dumping database uc_a09_deploy
13:17:17Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T131716Z.dump (212K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: rclone is not installed (apt install rclone)
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T131716Z.dump is complete; only its off-site copy is missing.
WARNING: the pre-deploy backup exists locally but its off-site copy failed; continuing (the alert stays raised)
13:17:17Z migrating
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_deploy", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"
3 migrations found in prisma/migrations
No pending migrations to apply.
13:17:18Z starting umrah-connect-api:36445209b763
13:17:25Z deployed 36445209b7636e82d883df4497f15c59edc44426
[exit 0]
# state: uc-api runs umrah-connect-api:36445209b763; tags: 000000000001 000000000002 36445209b763 cbee343f515b cd3dd419c78f core-check current previous 
$ heavy ./scripts/deploy.sh e7d6e514ad0471126d57763e87278d2ca2114700   # deploy #3 (broken health check -> expect rollback)
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (46 %)
preflight: all checks passed
13:17:26Z building umrah-connect-api:e7d6e514ad04
production configuration ok
13:17:53Z database
13:17:54Z pre-deploy backup
13:17:54Z dumping database uc_a09_deploy
13:17:55Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T131754Z.dump (212K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: rclone is not installed (apt install rclone)
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T131754Z.dump is complete; only its off-site copy is missing.
WARNING: the pre-deploy backup exists locally but its off-site copy failed; continuing (the alert stays raised)
13:17:55Z migrating
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_deploy", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"
3 migrations found in prisma/migrations
No pending migrations to apply.
13:17:56Z starting umrah-connect-api:e7d6e514ad04
 Container uc-a09-deploy-uc-api-1 Error dependency uc-api failed to start
dependency failed to start: container uc-a09-deploy-uc-api-1 is unhealthy
WARNING: health check failed for umrah-connect-api:e7d6e514ad04
WARNING: rolled the API container back to the previous release
ERROR: deploy of e7d6e514ad0471126d57763e87278d2ca2114700 failed. Migrations are not reversed automatically — see README: Rollback
[exit 1]
# state: uc-api runs umrah-connect-api:previous; tags: 000000000001 000000000002 36445209b763 cbee343f515b cd3dd419c78f core-check current e7d6e514ad04 previous 
$ readiness after the rollback: 
$ release reported by /api/v1/health: 
$ ./scripts/deploy.sh <commit not on origin/main>   # guard
ERROR: d4d495655c63b956953c8db6260b33315b31980f is not on origin/main; only reviewed commits of main are deployed
[exit 1]
# rollback improved (0b798eb: wait for the previous release, reset the checkout); releases R4 (good) and R5 (broken)
$ heavy ./scripts/deploy.sh 2c529e7d5259fb5601614479a6dd1338b1001826   # deploy #4 (normal release)
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (46 %)
preflight: all checks passed
13:20:19Z building umrah-connect-api:2c529e7d5259
production configuration ok
13:20:36Z database
13:20:37Z pre-deploy backup
13:20:37Z dumping database uc_a09_deploy
13:20:37Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T132037Z.dump (212K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: rclone is not installed (apt install rclone)
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T132037Z.dump is complete; only its off-site copy is missing.
WARNING: the pre-deploy backup exists locally but its off-site copy failed; continuing (the alert stays raised)
13:20:37Z migrating
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_deploy", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"
3 migrations found in prisma/migrations
No pending migrations to apply.
13:20:39Z starting umrah-connect-api:2c529e7d5259
13:20:45Z deployed 2c529e7d5259fb5601614479a6dd1338b1001826
[exit 0]
# state: uc-api runs umrah-connect-api:2c529e7d5259 (release 2c529e7d5259); checkout at 2c529e7; tags: 2c529e7d5259 36445209b763 cbee343f515b cd3dd419c78f core-check current e7d6e514ad04 previous 
$ heavy ./scripts/deploy.sh cf37ca32d2267944a41077c919bcb8c41205524a   # deploy #5 (broken health check -> expect rollback to #4)
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
SKIP off-site round trip (PREFLIGHT_SKIP_OFFSITE=1)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (46 %)
preflight: all checks passed
13:20:46Z building umrah-connect-api:cf37ca32d226
production configuration ok
13:21:01Z database
13:21:02Z pre-deploy backup
13:21:02Z dumping database uc_a09_deploy
13:21:02Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T132102Z.dump (212K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: rclone is not installed (apt install rclone)
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_deploy-20260919T132102Z.dump is complete; only its off-site copy is missing.
WARNING: the pre-deploy backup exists locally but its off-site copy failed; continuing (the alert stays raised)
13:21:02Z migrating
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_deploy", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"
3 migrations found in prisma/migrations
No pending migrations to apply.
13:21:04Z starting umrah-connect-api:cf37ca32d226
 Container uc-a09-deploy-uc-api-1 Error dependency uc-api failed to start
dependency failed to start: container uc-a09-deploy-uc-api-1 is unhealthy
WARNING: health check failed for umrah-connect-api:cf37ca32d226
WARNING: rolled the API container back to the previous release; it is healthy
WARNING: checkout reset to the running release 2c529e7d5259fb5601614479a6dd1338b1001826
ERROR: deploy of cf37ca32d2267944a41077c919bcb8c41205524a failed. Migrations are not reversed automatically — see README: Rollback
[exit 1]
# state: uc-api runs umrah-connect-api:previous (release 2c529e7d5259); checkout at 2c529e7; tags: 2c529e7d5259 36445209b763 cbee343f515b cd3dd419c78f cf37ca32d226 core-check current e7d6e514ad04 previous 
```
