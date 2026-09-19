# API container build and production-style smoke (no Render endpoint or credential)

Run 2026-09-19 on the development Mac (Colima Docker 29, arm64) by eng100 A09. Everything ran in disposable
resources named `uc-a09-*`: compose project `uc-a09-kvm` (the real `infrastructure/kvm` compose files, bundled-proxy
mode), Caddy published only on `127.0.0.1:18409/18443`, image `uc-a09-api:test`. The throwaway `.env.production`
had random secrets and **no Render value at all** (`grep -ci "onrender|render.com"` → 0); `STORAGE_DRIVER=local`
(+ persistent volume), `PAYMENT_PROVIDER=none`, `MAIL_DRIVER=none`, `API_DOMAIN=localhost` (Caddy's internal CA).
All resources were removed afterwards (`cleanup.txt`).

Result: image builds; runs as uid 10001 with root-owned code; no env file baked in; the only `onrender` strings in the
image are the new guard; unsafe/Render configuration is refused at boot and by `check-config`; migrations apply from an
empty database; the stack starts non-root behind TLS; health, readiness, security headers, Swagger hiding, auth
refusal, HTTP→HTTPS redirect and a real Super Admin sign-in pass. Two defects in the blueprint were found and fixed
(commit 927dbb1), and a restart window was removed (commit 07775e0).

## 1. Image
Build: `heavy docker build --build-arg UC_RELEASE=$(git rev-parse HEAD) -t uc-a09-api:test .` → exit 0.
```text
$ docker image inspect uc-a09-api:test --format size={{.Size}} user={{.Config.User}} entrypoint={{json .Config.Entrypoint}} cmd={{json .Config.Cmd}} revision={{index .Config.Labels "org.opencontainers.image.revision"}}
size=236773131 user=app entrypoint=["/usr/bin/tini","--","/usr/local/bin/api-entrypoint"] cmd=["serve"] revision=e7c88a5ea0345c3fe4535ee32ba25118bfd2a570
[exit 0]
$ docker run --rm --name uc-a09-img-1 --entrypoint sh uc-a09-api:test -c id; stat -c "%U:%G %a %n" /app /app/platform/api/dist/src/main.js /app/node_modules /app/platform/api/uploads /app/platform/api/uploads/private; touch /app/platform/api/dist/x 2>&1 | head -1; echo "UC_RELEASE=$UC_RELEASE CHECKPOINT_DISABLE=$CHECKPOINT_DISABLE"
uid=10001(app) gid=10001(app) groups=10001(app)
root:root 755 /app
root:root 644 /app/platform/api/dist/src/main.js
root:root 755 /app/node_modules
app:app 755 /app/platform/api/uploads
app:app 755 /app/platform/api/uploads/private
touch: cannot touch '/app/platform/api/dist/x': Permission denied
UC_RELEASE=e7c88a5ea0345c3fe4535ee32ba25118bfd2a570 CHECKPOINT_DISABLE=1
[exit 0]
$ docker run --rm --name uc-a09-img-2 --entrypoint sh uc-a09-api:test -c echo "env files in image:"; find / -xdev \( -name ".env" -o -name ".env.*" \) -not -path "/proc/*" 2>/dev/null; echo "Render-specific env vars:"; env | grep -ci "render" || true
env files in image:
/app/platform/api/.env.example
Render-specific env vars:
0
[exit 0]
$ docker run --rm --name uc-a09-img-3 --entrypoint sh uc-a09-api:test -c echo "files under /app mentioning onrender:"; grep -rIl "onrender" /app 2>/dev/null | wc -l; echo "files under /app mentioning render.com:"; grep -rIlE "[./@]render\.com" /app 2>/dev/null | head -5 | sed "s#^#  #"; grep -rIlE "[./@]render\.com" /app 2>/dev/null | wc -l
files under /app mentioning onrender:
2
files under /app mentioning render.com:
  /app/platform/api/src/bootstrap/env.validation.ts
1
[exit 0]
$ docker run --rm --name uc-a09-img-4 --entrypoint sh uc-a09-api:test -c 'grep -rIn onrender /app'
/app/platform/api/src/bootstrap/env.validation.ts:47:    if (env[k] && /onrender/i.test(env[k] as string)) problems.push(`${k} points at a Render host (onrender.com); Render is retired`);
/app/platform/api/dist/src/bootstrap/env.validation.js:48:        if (env[k] && /onrender/i.test(env[k]))
/app/platform/api/dist/src/bootstrap/env.validation.js:49:            problems.push(`${k} points at a Render host (onrender.com); Render is retired`);
[exit 0]
$ docker run --rm -e NODE_ENV=production -e DATABASE_URL=postgresql://u:***@dpg-x-a.oregon-postgres.render.com/db -e JWT_SECRET=<64 hex> -e WEB_URL=https://umrah-connect-api.onrender.com -e CORS_ORIGINS=https://umrahconnect.io -e GOOGLE_OIDC_STUB_URL=http://127.0.0.1:4999 uc-a09-api:test   # boot (serve)
Error: Refusing to start with unsafe production configuration:
  - STORAGE_DRIVER=local requires STORAGE_LOCAL_PERSISTENT=true (a persistent volume) in production
  - GOOGLE_OIDC_STUB_URL is a test-only setting and must not be set in production
  - WEB_URL points at a Render host (onrender.com); Render is retired
  - DATABASE_URL points at a Render-hosted database (render.com); restore the data into the KVM database instead
[exit 1]

$ same values, command check-config
Unsafe production configuration:
  - STORAGE_DRIVER=local requires STORAGE_LOCAL_PERSISTENT=true (a persistent volume) in production
  - GOOGLE_OIDC_STUB_URL is a test-only setting and must not be set in production
  - WEB_URL points at a Render host (onrender.com); Render is retired
  - DATABASE_URL points at a Render-hosted database (render.com); restore the data into the KVM database instead
[exit 1]

$ docker run --rm -e NODE_ENV=development uc-a09-api:test check-config
check-config: NODE_ENV is not production; nothing to check
[exit 1]
```

## 2. Stack bring-up (migrations from empty, `--wait`, hardening, isolation)
```text
$ sh -c docker compose --env-file .env.production config | grep '^name:'
name: uc-a09-kvm
[exit 0]
$ docker compose --env-file .env.production up -d uc-postgres
[exit 0]
uc-postgres healthy
$ docker compose --env-file .env.production run --rm uc-api check-config
production configuration ok
[exit 0]
$ docker compose --env-file .env.production run --rm uc-api migrate
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_smoke", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"

3 migrations found in prisma/migrations

Applying migration `20260917000000_baseline`
Applying migration `20260917154700_auth_hardening_platform_role`
Applying migration `20260917160539_payments_checkout_stripe`

The following migration(s) have been applied:

migrations/
  └─ 20260917000000_baseline/
    └─ migration.sql
  └─ 20260917154700_auth_hardening_platform_role/
    └─ migration.sql
  └─ 20260917160539_payments_checkout_stripe/
    └─ migration.sql
      
All migrations have been successfully applied.
[exit 0]
$ docker compose --env-file .env.production run --rm uc-api status
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "uc_a09_smoke", schemas "audit, core, marketplace, plugin_booking, plugin_crm, plugin_finance, plugin_group_ops, plugin_hotel, plugin_portal, plugin_reporting, plugin_transport, plugin_visa, social" at "uc-postgres:5432"

3 migrations found in prisma/migrations

Database schema is up to date!
[exit 0]
$ docker compose --env-file .env.production up -d --wait --wait-timeout 240
container uc-a09-kvm-uc-caddy-1 is unhealthy
[exit 1]
$ sh -c docker ps -a --filter name=uc-a09-kvm --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
uc-a09-kvm-uc-caddy-1	Restarting (255) Less than a second ago	
uc-a09-kvm-uc-caddy-init-1	Exited (0) 7 seconds ago	
uc-a09-kvm-uc-api-1	Up 7 seconds (healthy)	4000/tcp
uc-a09-kvm-uc-postgres-1	Up 22 seconds (healthy)	5432/tcp
[exit 0]

# fix: uc-caddy needs cap_add NET_BIND_SERVICE (file capability on the caddy binary); re-run
$ docker compose --env-file .env.production up -d --wait --wait-timeout 240
 Container uc-a09-kvm-uc-caddy-init-1 Error service "uc-caddy-init" didn't complete successfully: exit 1
service "uc-caddy-init" didn't complete successfully: exit 1
[exit 1]
$ sh -c docker ps -a --filter name=uc-a09-kvm --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
uc-a09-kvm-uc-caddy-1	Created	
uc-a09-kvm-uc-caddy-init-1	Exited (1) 3 seconds ago	
uc-a09-kvm-uc-api-1	Up 58 seconds (healthy)	4000/tcp
uc-a09-kvm-uc-postgres-1	Up About a minute (healthy)	5432/tcp
[exit 0]
$ sh -c docker inspect --format '{{.Name}} user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} capdrop={{.HostConfig.CapDrop}} capadd={{.HostConfig.CapAdd}} secopt={{.HostConfig.SecurityOpt}} restart={{.HostConfig.RestartPolicy.Name}} log={{.HostConfig.LogConfig.Type}}{{.HostConfig.LogConfig.Config}}' uc-a09-kvm-uc-caddy-1 uc-a09-kvm-uc-api-1 uc-a09-kvm-uc-postgres-1
/uc-a09-kvm-uc-caddy-1 user=10002:10002 readonly=true capdrop=[ALL] capadd=[CAP_NET_BIND_SERVICE] secopt=[no-new-privileges:true] restart=unless-stopped log=json-filemap[max-file:5 max-size:20m]
/uc-a09-kvm-uc-api-1 user=app readonly=true capdrop=[ALL] capadd=[] secopt=[no-new-privileges:true] restart=unless-stopped log=json-filemap[max-file:5 max-size:20m]
/uc-a09-kvm-uc-postgres-1 user= readonly=false capdrop=[] capadd=[] secopt=[] restart=unless-stopped log=json-filemap[max-file:5 max-size:20m]
[exit 0]
$ sh -c docker exec uc-a09-kvm-uc-caddy-1 sh -c 'id; ls -ld /data /config'
Error response from daemon: container <id> is not running
[exit 1]
$ sh -c for c in uc-a09-kvm-uc-postgres-1 uc-a09-kvm-uc-api-1 uc-a09-kvm-uc-caddy-1; do printf '%s published: ' $c; docker port $c | tr '\n' ' '; echo; done
uc-a09-kvm-uc-postgres-1 published: 
uc-a09-kvm-uc-api-1 published: 
uc-a09-kvm-uc-caddy-1 published: 
[exit 0]
$ sh -c docker network inspect uc-a09-kvm_uc-backend --format 'uc-backend internal={{.Internal}} members={{range .Containers}}{{.Name}} {{end}}'; docker network inspect uc-a09-kvm_uc-edge --format 'uc-edge internal={{.Internal}} members={{range .Containers}}{{.Name}} {{end}}'
uc-backend internal=true members=uc-a09-kvm-uc-postgres-1 uc-a09-kvm-uc-api-1 
uc-edge internal=false members=uc-a09-kvm-uc-api-1 
[exit 0]
$ sh -c docker exec uc-a09-kvm-uc-postgres-1 sh -c 'getent hosts example.com >/dev/null && echo postgres has DNS/egress || echo postgres: no route to the outside (internal network)'
sh: 1: Syntax error: "(" unexpected
[exit 2]

# fix: uc-caddy-init needs DAC_READ_SEARCH to re-walk its own 0700 volumes on later runs; re-run twice (idempotency)
$ docker compose --env-file .env.production up -d --wait --wait-timeout 240
[exit 0]
$ docker compose --env-file .env.production up -d --wait --wait-timeout 240
[exit 0]
$ sh -c docker ps -a --filter name=uc-a09-kvm --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
uc-a09-kvm-uc-caddy-init-1	Exited (0) 1 second ago	
uc-a09-kvm-uc-caddy-1	Up 32 seconds (healthy)	2019/tcp, 127.0.0.1:18409->80/tcp, 127.0.0.1:18443->443/tcp, 127.0.0.1:18443->443/udp
uc-a09-kvm-uc-api-1	Up About a minute (healthy)	4000/tcp
uc-a09-kvm-uc-postgres-1	Up 2 minutes (healthy)	5432/tcp
[exit 0]
$ docker exec uc-a09-kvm-uc-caddy-1 sh -c id; ls -ld /data /config
uid=10002 gid=10002 groups=10002
drwx------    3 10002    10002         4096 Sep 19 12:43 /config
drwx------    3 10002    10002         4096 Sep 19 12:43 /data
[exit 0]
$ docker inspect --format {{.Name}} user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} capdrop={{.HostConfig.CapDrop}} capadd={{.HostConfig.CapAdd}} secopt={{.HostConfig.SecurityOpt}} restart={{.HostConfig.RestartPolicy.Name}} uc-a09-kvm-uc-caddy-1
/uc-a09-kvm-uc-caddy-1 user=10002:10002 readonly=true capdrop=[ALL] capadd=[CAP_NET_BIND_SERVICE] secopt=[no-new-privileges:true] restart=unless-stopped
[exit 0]
$ docker exec uc-a09-kvm-uc-postgres-1 sh -c if getent hosts example.com >/dev/null; then echo "postgres resolves external names"; else echo "postgres: no external DNS or route (internal network)"; fi
postgres: no external DNS or route (internal network)
[exit 0]
$ docker exec uc-a09-kvm-uc-api-1 sh -c getent hosts uc-postgres >/dev/null && echo "api resolves uc-postgres"; getent hosts example.com >/dev/null && echo "api has outbound DNS (uc-edge)"
api resolves uc-postgres
api has outbound DNS (uc-edge)
[exit 0]
```

Process owners (no service runs as root). `docker top` resolves uids through the Colima VM's `/etc/passwd`: uid 999
is `postgres` inside the container and happens to be called `dnsmasq` in the VM.
```text
$ docker top uc-a09-kvm-uc-postgres-1 -o user,pid,comm  (server processes after the entrypoint dropped privileges)
USER                PID                 COMMAND
dnsmasq             115092              postgres
dnsmasq             115142              postgres
dnsmasq             115143              postgres
dnsmasq             115145              postgres
dnsmasq             115146              postgres
$ docker top uc-a09-kvm-uc-api-1 -o user,pid,comm
USER                PID                 COMMAND
10001               153764              tini
10001               153798              node
$ docker top uc-a09-kvm-uc-caddy-1 -o user,pid,comm
USER                PID                 COMMAND
10002               122364              caddy
```

## 3. HTTPS smoke through Caddy and a real sign-in
The access token is never printed. Re-running `bootstrap-admin` keeps an existing password unless
`PLATFORM_ADMIN_RESET_PASSWORD=true` (a second run without it correctly got 401), so the final run sets it.
A body-less `POST /payments/webhook/sandbox` answers `200 {"success":false}` (the controller returns before the
provider lookup) — reported to A04 as a minor contract wart; with a body it is the expected 404 below.
```text
$ sh -c curl -sS --cacert $TMPDIR/uc-a09/caddy-root.crt -D - https://localhost:18443/api/v1/health | grep -iE '^(HTTP|strict-transport|x-request-id|content-security|x-content-type|server|referrer-policy)|release|status'
HTTP/2 200 
content-security-policy: default-src 'none';frame-ancestors 'none';base-uri 'self';font-src 'self' https: data:;form-action 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
referrer-policy: no-referrer
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
x-request-id: df63d878-8151-4dc4-b265-7404e58fc9f1
{"status":"ok","service":"umrah-connect-api","release":"e7c88a5ea034","db":"connected","uptime":196,"timestamp":"2026-09-19T12:46:41.873Z"}
[exit 0]
$ sh -c echo "GET /api/v1/health/ready -> $(curl -sS --cacert $TMPDIR/uc-a09/caddy-root.crt -o /dev/null -w '%{http_code}' https://localhost:18443/api/v1/health/ready) $(curl -sS --cacert $TMPDIR/uc-a09/caddy-root.crt https://localhost:18443/api/v1/health/ready)"
GET /api/v1/health/ready -> 200 {"status":"ready","timestamp":"2026-09-19T12:46:41.905Z"}
[exit 0]
$ sh -c echo "GET /api/docs -> $(curl -sS --cacert $TMPDIR/uc-a09/caddy-root.crt -o /dev/null -w '%{http_code}' https://localhost:18443/api/docs)"
GET /api/docs -> 404
[exit 0]
$ sh -c echo "GET /api/v1/admin/users (anonymous) -> $(curl -sS --cacert $TMPDIR/uc-a09/caddy-root.crt -o /dev/null -w '%{http_code}' https://localhost:18443/api/v1/admin/users)"
GET /api/v1/admin/users (anonymous) -> 401
[exit 0]
$ sh -c echo "POST /api/v1/payments/webhook/sandbox {} -> $(curl -sS --cacert $TMPDIR/uc-a09/caddy-root.crt -w ' %{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://localhost:18443/api/v1/payments/webhook/sandbox)"
POST /api/v1/payments/webhook/sandbox {} -> {"success":false,"error":{"code":"NOT_FOUND","message":"Unknown webhook endpoint","requestId":"dd21038c-12f2-4f36-87f1-e49253cef42c","timestamp":"2026-09-19T12:46:41.959Z"}} 404
[exit 0]
$ sh -c curl -sS -o /dev/null -w 'GET http://localhost:18409/api/v1/health -> %{http_code} Location: %{redirect_url}\n' http://localhost:18409/api/v1/health
GET http://localhost:18409/api/v1/health -> 308 Location: https://localhost/api/v1/health
[exit 0]
$ sh -c for c in uc-a09-kvm-uc-postgres-1 uc-a09-kvm-uc-api-1; do printf '%s published ports: ' $c; docker port $c | wc -l; done
uc-a09-kvm-uc-postgres-1 published ports:        0
uc-a09-kvm-uc-api-1 published ports:        0
[exit 0]
$ docker compose --env-file .env.production run --rm -e PLATFORM_ADMIN_EMAIL -e PLATFORM_ADMIN_PASSWORD -e PLATFORM_ADMIN_RESET_PASSWORD uc-api bootstrap-admin
Super Admin ready: ops-rehearsal@example.invalid (platform organization 4e92ffba-3021-41a1-b1af-69474d1ba8ff) — password reset
[exit 0]
$ POST /api/v1/auth/login (bootstrapped Super Admin) -> 200, access token received (not printed)
$ GET /api/v1/auth/me -> 200 email=ops-rehearsal@example.invalid roles=['SUPER_ADMIN']
```

## 4. Deploy restart window (API container recreated while probing every 0.5 s)
```text
## before: health_interval 15s, no lb_try_duration
$ docker compose --env-file .env.production up -d --force-recreate --no-deps --wait --wait-timeout 120 uc-api
[exit 0]
requests answered 200: 90, other: 1 [ 502 ]

## after (run 1): health_interval 5s, lb_try_duration 20s
$ docker compose --env-file .env.production up -d --force-recreate --no-deps --wait --wait-timeout 120 uc-api
[exit 0]
requests answered 200: 89, other: 0 [ ]

## after (run 2): health_interval 5s, lb_try_duration 20s
$ docker compose --env-file .env.production up -d --force-recreate --no-deps --wait --wait-timeout 120 uc-api
[exit 0]
requests answered 200: 93, other: 0 [ ]
```

