# Uptime monitoring (I08) and scheduled jobs — local verification

Implementation (engineering, done): `scripts/uptime-check.sh` (provider-neutral probe), `.github/workflows/uptime.yml`
(every 5 min, inert until the repository variable `UPTIME_MONITOR=on`; incident issue opened/closed with the built-in
token), `infrastructure/kvm/scripts/healthcheck.sh` + `alert.sh` + `systemd/umrah-healthcheck.*` / `umrah-alert@`
(host timer, alert after 2 failures, hourly repeat, recovery message), external monitor specification in the runbook §6.
Production activation (owner, after cutover): see `RENDER_RETIREMENT.md` step 5 and the runbook §6.

Workflow lint: actionlint 1.7.7 → no findings (`blueprint-validation.md`). The GitHub-side issue handling cannot run
locally; it is linted only.

The web checks ran against a static stand-in on 127.0.0.1:19409/19410 that only serves `/` and
`/proxy-api/health/ready` — it exercises the script's logic (including the Render-header guard), not the real web app.
Alerts went to a local webhook receiver on 127.0.0.1:19411.

## 1. Probe and host health check
```text
## scripts/uptime-check.sh (the probe used by .github/workflows/uptime.yml and the host timer)
# M1 API checks through the disposable stack's Caddy (local CA; its leaf certificates live 12 h, so TLS_MIN_DAYS=0 here)
#    web checks against a static stand-in on :19409 (exercises the script logic only, not the real web)
$ env UPTIME_API_URL=https://localhost:18443 UPTIME_WEB_URL=http://127.0.0.1:19409 UPTIME_TLS_MIN_DAYS=0 /Users/macbook/Projects/umrah-connects-eng100/a09/scripts/uptime-check.sh
PASS api-ready                HTTP 200 https://localhost:18443/api/v1/health/ready
PASS api-live                 HTTP 200 https://localhost:18443/api/v1/health
INFO api-release              e7c88a5ea034
PASS api-tls                  localhost certificate valid until Sep 20 00:44:48 2026 GMT
PASS web-home                 HTTP 200 http://127.0.0.1:19409/
PASS web-proxy-api            HTTP 200 http://127.0.0.1:19409/proxy-api/health/ready
SKIP web-tls                  not an https URL
uptime-check: all 5 checks passed
[exit 0]
# M2 certificate lifetime rule: the 12-hour local certificate fails the default 14-day minimum
$ env UPTIME_API_URL=https://localhost:18443 UPTIME_WEB_URL= UPTIME_ATTEMPTS=1 /Users/macbook/Projects/umrah-connects-eng100/a09/scripts/uptime-check.sh
PASS api-ready                HTTP 200 https://localhost:18443/api/v1/health/ready
PASS api-live                 HTTP 200 https://localhost:18443/api/v1/health
INFO api-release              e7c88a5ea034
FAIL api-tls                  localhost certificate expires within 14 days (Sep 20 00:44:48 2026 GMT)
uptime-check: 1 of 3 checks FAILED
[exit 1]
# M3 API down (nothing listening) -> failure after retries
$ env UPTIME_API_URL=https://127.0.0.1:19999 UPTIME_WEB_URL= UPTIME_ATTEMPTS=2 UPTIME_RETRY_DELAY=1 UPTIME_TIMEOUT=3 /Users/macbook/Projects/umrah-connects-eng100/a09/scripts/uptime-check.sh
FAIL api-ready                HTTP 000 curl: (7) Failed to connect to 127.0.0.1 port 19999 after 0 ms: Couldn't connect to server  (https://127.0.0.1:19999/api/v1/health/ready)
FAIL api-live                 HTTP 000 curl: (7) Failed to connect to 127.0.0.1 port 19999 after 0 ms: Couldn't connect to server  (https://127.0.0.1:19999/api/v1/health)
FAIL api-tls                  no certificate from 127.0.0.1 (127.0.0.1:19999)
uptime-check: 3 of 3 checks FAILED
[exit 1]
# M4 web answers through Render (rndr-id header) -> failure: Render is retired
$ env UPTIME_API_URL= UPTIME_WEB_URL=http://127.0.0.1:19410 UPTIME_ATTEMPTS=1 /Users/macbook/Projects/umrah-connects-eng100/a09/scripts/uptime-check.sh
FAIL web-home                 answered via Render (rndr-id/x-render-* headers) — Render is retired (http://127.0.0.1:19410/)
FAIL web-proxy-api            answered via Render (rndr-id/x-render-* headers) — Render is retired (http://127.0.0.1:19410/proxy-api/health/ready)
SKIP web-tls                  not an https URL
uptime-check: 2 of 2 checks FAILED
[exit 1]
# M5 server-side edge check: connect to 127.0.0.1 for the API host name (as healthcheck.sh does)
$ env UPTIME_API_URL=https://localhost:18443 UPTIME_WEB_URL= UPTIME_CONNECT_TO=127.0.0.1 UPTIME_TLS_MIN_DAYS=0 /Users/macbook/Projects/umrah-connects-eng100/a09/scripts/uptime-check.sh
PASS api-ready                HTTP 200 https://localhost:18443/api/v1/health/ready
PASS api-live                 HTTP 200 https://localhost:18443/api/v1/health
INFO api-release              e7c88a5ea034
PASS api-tls                  localhost certificate valid until Sep 20 00:44:48 2026 GMT
uptime-check: all 3 checks passed
[exit 0]

## infrastructure/kvm/scripts/healthcheck.sh + alert.sh (host timer), alerts to a local webhook receiver
# H1 healthy stack
$ ./scripts/healthcheck.sh
ok   uc-postgres: running healthy
ok   uc-api: running healthy
ok   uc-caddy: running healthy
ok   uc-api readiness (in container)
ok   HTTPS edge for localhost via 127.0.0.1
ok   disk /Users/macbook/.uc-a09-rehearsal/backups 45%
ok   backup newer than 26h
[exit 0]
# H2 API stopped: run 1 fails without alerting (ALERT_AFTER=2)
$ docker compose --env-file .env.production stop uc-api
[exit 0]
$ ./scripts/healthcheck.sh
ok   uc-postgres: running healthy
FAIL uc-api: no container
ok   uc-caddy: running healthy
FAIL uc-api readiness (in container) failed
FAIL HTTPS edge for localhost via 127.0.0.1: FAIL api-ready                HTTP 000 curl: (28) Operation timed out after 10011 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health/ready);FAIL api-live                 HTTP 000 curl: (28) Operation timed out after 10003 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health);
ok   disk /Users/macbook/.uc-a09-rehearsal/backups 45%
ok   backup newer than 26h
[exit 1]
$ cat /Users/macbook/.uc-a09-rehearsal/state/healthcheck.state
1 0 0
[exit 0]
# H3 run 2 fails -> DOWN alert
$ ./scripts/healthcheck.sh
ok   uc-postgres: running healthy
FAIL uc-api: no container
ok   uc-caddy: running healthy
FAIL uc-api readiness (in container) failed
FAIL HTTPS edge for localhost via 127.0.0.1: FAIL api-ready                HTTP 000 curl: (28) Operation timed out after 10010 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health/ready);FAIL api-live                 HTTP 000 curl: (28) Operation timed out after 10003 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health);
ok   disk /Users/macbook/.uc-a09-rehearsal/backups 45%
ok   backup newer than 26h
[umrah-connect@Macbooks-MacBook-Pro] DOWN: 2 consecutive failed health checks
- uc-api: no container
- uc-api readiness (in container) failed
- HTTPS edge for localhost via 127.0.0.1: FAIL api-ready                HTTP 000 curl: (28) Operation timed out after 10010 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health/ready);FAIL api-live                 HTTP 000 curl: (28) Operation timed out after 10003 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health);

[exit 1]
# H4 run 3 still failing inside ALERT_REPEAT_MINUTES -> no second alert
$ ./scripts/healthcheck.sh
ok   uc-postgres: running healthy
FAIL uc-api: no container
ok   uc-caddy: running healthy
FAIL uc-api readiness (in container) failed
FAIL HTTPS edge for localhost via 127.0.0.1: FAIL api-ready                HTTP 000 curl: (28) Operation timed out after 10009 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health/ready);FAIL api-live                 HTTP 000 curl: (28) Operation timed out after 10011 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health);
ok   disk /Users/macbook/.uc-a09-rehearsal/backups 45%
ok   backup newer than 26h
[exit 1]
$ cat /Users/macbook/.uc-a09-rehearsal/state/healthcheck.state
3 1789822681 1
[exit 0]
# H5 API back -> RECOVERED alert, state reset
$ docker compose --env-file .env.production start uc-api
[exit 0]
uc-api healthy
$ ./scripts/healthcheck.sh
ok   uc-postgres: running healthy
ok   uc-api: running healthy
ok   uc-caddy: running healthy
ok   uc-api readiness (in container)
ok   HTTPS edge for localhost via 127.0.0.1
ok   disk /Users/macbook/.uc-a09-rehearsal/backups 45%
ok   backup newer than 26h
[umrah-connect@Macbooks-MacBook-Pro] RECOVERED: all health checks pass again
[exit 0]
$ cat /Users/macbook/.uc-a09-rehearsal/state/healthcheck.state
0 0 0
[exit 0]
# H6 webhook deliveries received (content type + body):
application/json {"text":"[umrah-connect@Macbooks-MacBook-Pro] DOWN: 2 consecutive failed health checks\n- uc-api: no container\n- uc-api readiness (in container) failed\n- HTTPS edge for localhost via 127.0.0.1: FAIL api-ready                HTTP 000 curl: (28) Operation timed out after 10010 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health/ready);FAIL api-live                 HTTP 000 curl: (28) Operation timed out after 10003 milliseconds with 0 bytes received  (https://localhost:18443/api/v1/health);"}
---
application/json {"text":"[umrah-connect@Macbooks-MacBook-Pro] RECOVERED: all health checks pass again"}
---
# H7 plain-text format and an unreachable webhook
$ env ALERT_WEBHOOK_FORMAT=text ./scripts/alert.sh test alert (text format) line 2
[umrah-connect@Macbooks-MacBook-Pro] test alert (text format)
line 2
[exit 0]
text/plain; charset=utf-8 [umrah-connect@Macbooks-MacBook-Pro] test alert (text format)
line 2
---
$ env ALERT_WEBHOOK_URL=http://127.0.0.1:19999/nope ./scripts/alert.sh test alert (unreachable webhook)
[umrah-connect@Macbooks-MacBook-Pro] test alert (unreachable webhook)
WARNING: the alert webhook did not accept the message (URL not shown); the alert is in the journal
[exit 1]
```

## 2. O04 cleanup scheduling wiring
A06's command is committed on `eng100/a06` (`28bab77`, `platform/api/src/modules/storage/cleanup/orphan-cleanup.cli.ts`)
and is not in this branch's image until the coordinator merges it. Verified here: the mode contract, exit-code
propagation, and the entrypoint's argument pass-through at the exact compiled path (a stand-in script mounted there).
```text
## O04 scheduling wiring (A06's command is committed on eng100/a06 at 28bab77; not yet in this image)
# W1 invalid mode is refused before anything runs
$ env ORPHAN_CLEANUP_MODE=delete-everything ./scripts/orphan-cleanup.sh
ERROR: ORPHAN_CLEANUP_MODE must be report or apply
[exit 1]
# W2 report mode in this image (A06 not merged yet): the command is missing -> non-zero exit reaches systemd (alert)
$ ./scripts/orphan-cleanup.sh
12:59:50Z orphan cleanup: report
node:internal/modules/cjs/loader:1433
  throw err;
  ^

Error: Cannot find module '/app/platform/api/dist/src/modules/storage/cleanup/orphan-cleanup.cli.js'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1430:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1040:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1045:22)
    at Function._load (node:internal/modules/cjs/loader:1216:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:254:19)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v22.23.2

[exit 1]
# W3 entrypoint pass-through with a stand-in mounted at the compiled path (report and apply argument sets)
$ docker compose --env-file .env.production run --rm --no-deps -T -v /Users/macbook/.uc-a09-rehearsal/o04/orphan-cleanup.cli.js:/app/platform/api/dist/src/modules/storage/cleanup/orphan-cleanup.cli.js:ro uc-api cleanup-orphans --allow-production
stand-in received args=["--allow-production"] NODE_ENV=production DATABASE_URL=set
[exit 0]
$ docker compose --env-file .env.production run --rm --no-deps -T -v /Users/macbook/.uc-a09-rehearsal/o04/orphan-cleanup.cli.js:/app/platform/api/dist/src/modules/storage/cleanup/orphan-cleanup.cli.js:ro uc-api cleanup-orphans --apply --allow-production
stand-in received args=["--apply","--allow-production"] NODE_ENV=production DATABASE_URL=set
[exit 0]
```
