# Render retirement

Render hosted the legacy API (`umrah-connect-api`, https://umrah-connect-api.onrender.com, service
`srv-d94peplckfvc73adlr9g`) and its database (`dpg-d94o1dtckfvc73abpon0-a`). The target architecture is
Vercel (web) → Hostinger KVM 8 (API + PostgreSQL 16, `infrastructure/kvm/`) → Cloudflare R2, Stripe.
**Render is not part of the target.**

Retirement is tracked as three separate states. Finishing one does not imply the others.

| # | State | Status | Owner |
|---|---|---|---|
| 1 | Target runtime dependency on Render removed from the repository and the production stack | **DONE** (eng100 A09, 2026-09-19; web `next build` with `API_PROXY_ORIGIN` is the coordinator's check) | engineering |
| 2 | Exposed Render API key revoked | NOT DONE — see `CREDENTIAL_REMEDIATION.md` | coordinator / repository owner |
| 3 | Old live Render service and database decommissioned | NOT DONE — needs the backup and an authorized KVM cutover first | repository owner |

## State 1 — target runtime dependency removed

Evidence: `evidence/eng100/a09/` —
- `render-inventory-before.txt` / `render-inventory-after.txt`: every mention classified; all runtime and deploy
  surfaces (Dockerfile, compose files, Caddyfile, entrypoint, systemd units, workflows, `start-all.sh`, API source,
  `next.config.mjs`, middleware, every env template) contain no `onrender.com`/`render.com`; no code reads a Render
  variable.
- `container-build-smoke.md`: the API image built and ran as the full KVM stack (Caddy TLS, PostgreSQL 16, migrations
  from empty, sign-in) with a configuration containing no Render value at all; the only `onrender` strings inside the
  image are the new guard; Render-era values are refused at boot and by `check-config`.

### Inventory and classification

Command (tracked files, lockfile excluded, PCRE word boundary so the React verb "render" is not counted):
`git grep -P -n -I "onrender|render\.yaml|RENDER_[A-Z]|\bRender\b" -- . ':!pnpm-lock.yaml'`.
Before: 115 hits in 48 files, 19 of them `onrender.com`; no code reads a Render-specific variable (`RENDER_*`, `IS_PULL_REQUEST`).

| Reference | Class | Action |
|---|---|---|
| `render.yaml` (Blueprint: Docker runtime, free plan, `autoDeploy` from `main`, health `/api/v1/health`) | Runtime / deploy dependency | **Deleted.** Its last content stays in history: `git show 9a4da31:render.yaml`. Keeping a copy would only invite a re-import. Deleting the file does **not** stop, suspend or delete the Render service (state 3). |
| `apps/web/next.config.mjs` `onrender.com` fallback | Runtime dependency (web) | Already removed before this loop: a production build without `API_PROXY_ORIGIN` fails. The remaining comment explains why. |
| API code, `Dockerfile`, `.dockerignore`, `.github/workflows/api-ci.yml`, `start-all.sh`, env templates | Checked | No Render endpoint, variable, build hook or deploy step. The image builds and runs with no Render value (evidence). |
| `platform/api/src/modules/health/health.controller.ts` comment "Render/Koyeb" | Stale comment | Updated. |
| `DEPLOYMENT.md`, `STACK_NOTES.md`, `docs/HANDOFF.md` §3/§6, `.project/workspace.json`, `infrastructure/kvm/README.md`, `INFRASTRUCTURE.md` | Current operational docs | Updated to the KVM target; Render named only as retired/legacy. |
| `docs/migration/01,03,05,06,07,08,09` | Dated migration snapshot (2026-09-12) | Status banner added; Render lines that read as current fact corrected. The pasteable bootstrap prompt (09) is marked superseded. |
| `docs/audit/*`, `IMPLEMENTATION_LOG.md`, `STATUS.md`, `COMPLETION_REPORT.md` | Historical evidence | Kept unchanged, marked RETIRED with a banner. |
| `docs/control-tower/*` (BLOCKERS, DECISIONS D-019, FINDINGS_CHECKLIST, AGENT_WORKSPACE_BOOTSTRAP, LOCAL_WORKSPACE_POLICY, …) and `README.md` | Coordinator-owned records | Change requests handed to the coordinator (eng100 A09 report). |
| `platform/api/prisma/schema.prisma` comment "Render/Docker" | Stale comment (shared file) | Change request to the coordinator. The `debian-openssl-3.0.x` target itself is still required by the Docker image. |
| `apps/web/components/providers/query-provider.tsx` comment (Render cold start) | Historical rationale | Kept: the retry policy is provider-neutral. |
| `docs/ui-ux/*`, `audit/make_report_v2.py` ("Render a …") | False positive (verb) | None. |

### Guards that keep Render out

- The API refuses to start in production when a URL-valued setting points at `*.onrender.com`
  (`platform/api/src/bootstrap/env.validation.ts`, unit-tested), and `infrastructure/kvm/scripts/preflight.sh`
  refuses an `.env.production` that mentions `onrender.com`.
- `scripts/uptime-check.sh` fails a check whose response carries Render's routing headers, so a web proxy still
  pointing at Render is reported as down rather than green.

## State 2 — exposed credential revoked

A Render API key (and a GitHub token) are in pushed git history (`.claude/settings.local.json`, INT-002 / BLK-09).
Revocation, rotation and the history decision are tracked by the coordinator in `CREDENTIAL_REMEDIATION.md`.
Revoking the key does not affect the running service and should not wait for the cutover.

## State 3 — old live service decommissioned (NOT DONE)

The service still exists, is not suspended and times out. It keeps its dashboard configuration: removing
`render.yaml` does not stop it, and while Auto-Deploy is on, every push to `main` can still trigger a Render build.

Owner steps, in this order:

0. *(Optional, any time, reversible)* Render dashboard → service → Settings → Auto-Deploy **off**, so pushes to `main`
   stop building on Render. This changes no traffic.
1. **Back up the legacy database first.** In the Render dashboard check the database's status and plan (if an expiry
   date is shown, this step is time-critical). Then `pg_dump --format=custom --no-owner "$LEGACY_DATABASE_URL" > legacy.dump`,
   `sha256sum legacy.dump > legacy.dump.sha256`, `pg_restore --list legacy.dump > /dev/null`, and keep one copy off the
   server (runbook §3).
2. **Deploy the KVM** (`infrastructure/kvm/README.md` §1–§3): host setup, preflight, first deployment, restore
   `legacy.dump`, baseline resolve, migrations, `sync-rbac`, Super Admin bootstrap.
3. **DNS:** create `api.umrahconnect.io` (A, and AAAA if the server has IPv6) → KVM public IP. Wait until
   `curl -fsS https://api.umrahconnect.io/api/v1/health/ready` answers from the KVM (the `release` field of
   `/api/v1/health` equals the deployed commit).
4. **Vercel:** Production environment `API_PROXY_ORIGIN=https://api.umrahconnect.io` (plus the proxy-secret pairing,
   XT-R05), redeploy, and confirm no Vercel variable still contains `onrender.com`.
5. **Verify:** `UPTIME_API_URL=https://api.umrahconnect.io UPTIME_WEB_URL=https://umrahconnect.io scripts/uptime-check.sh`
   passes every check (including "not served via Render"); sign in through https://umrahconnect.io/login; then turn on
   monitoring (runbook §7 — GitHub variable `UPTIME_MONITOR=on`, external monitor, host timers).
6. **Suspend** the Render service (reversible). Watch 24–72 h: uptime checks green, Vercel logs clean.
7. **Delete** the Render service. Delete the Render database only after the restored KVM data is verified and a copy
   of `legacy.dump` is stored off-site. Remove the Render Blueprint and revoke Render's GitHub App access to the repository.
8. **Confirm no traffic:** the suspended/deleted service shows no requests; Vercel runtime logs show only
   `api.umrahconnect.io` upstreams; the DNS zone has no record pointing at `*.onrender.com`; `git grep onrender`
   returns only historical documents.
