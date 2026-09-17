# Workspace Provenance

Recorded 2026-09-17 by LOOP00A-R (Claude Code, Opus 5) from this repository. No secret values appear in this document. The Git remote is **public**.

> The previous LOOP00A attempt was interrupted because the wrong folder was selected. It is not an authoritative workspace record.

## Identity

| Fact | Value |
|---|---|
| Canonical root | `/Users/macbook/Projects/umrah-connects` |
| Resolved root (`pwd -P`) | `/Users/macbook/Projects/umrah-connects` (no symlinks) |
| Git root (`git rev-parse --show-toplevel`) | `/Users/macbook/Projects/umrah-connects` |
| Git remote `origin` | `https://github.com/sabilahmad77/umrahconnects.git` (public, default branch `main`) |
| Branch | `main`, tracking `origin/main` |
| HEAD at recovery | `65ce3dce0a53f957cfbcbe3bdb3bcfb9468dbe0d` (`docs(audit): current-state audit and production-readiness baseline`) |
| Ahead / behind upstream | ahead 1 (`65ce3dc`, local-only, unpushed), behind 0 |
| `origin/main` | `f71a6de` |
| Commits on `main` | 18 |
| Worktrees | 1 (this directory only) |
| Submodules | none |
| Stashes | none |
| Dirty state at recovery start | clean |
| Dirty state at recovery end | LOOP00A-R additions only, left uncommitted: `.claude/launch.json` (modified); `.project/`, `docs/control-tower/`, `scripts/` (new) |
| Package | `umrah-connects` 0.1.0, "Multi-tenant SaaS operating system for licensed Umrah and Hajj operators" |
| Tooling | pnpm 9.12.0 workspace + turbo; Node 22.23.2; Prisma 5.22.0; PostgreSQL client 15.19 |

Project identity markers checked: root `package.json` name; `pnpm-workspace.yaml` (`apps/*`, `platform/*`, `plugins/*`); `turbo.json`; `apps/web` (`@umrah-connects/web`); `platform/api` (`@umrah-connects/api`); `apps/mobile` (`@umrah-connects/mobile`); 10 domain plugins (`booking`, `crm`, `finance`, `group-ops`, `hotel`, `marketplace`, `pilgrim-portal`, `social`, `transport`, `visa`); a Prisma schema with 13 Postgres schemas (`core`, `marketplace`, `plugin_visa`, …); `docs/audit/`, `docs/migration/` and `docs/HANDOFF.md`; deployment config (`render.yaml`, `Dockerfile`, `docker-compose.yml`). The API health endpoint identifies itself as `umrah-connect-api`.

## Source paths

| Component | Path | Stack |
|---|---|---|
| Frontend | `apps/web` | Next.js 14.2.35 App Router |
| Backend/API | `platform/api` | NestJS 10, global prefix `/api/v1` |
| Database schema | `platform/api/prisma/schema.prisma` | Prisma, `db push` workflow (no migrations directory) |
| Mobile | `apps/mobile` | Expo (not at parity) |
| Plugins | `plugins/*` | pnpm workspace packages |

## Runtime provenance (after controlled restart)

The stack was already running from this repository when recovery began: API PID 7233 and web PID 15461, both with their working directory inside this repository. These processes got `PORT=4100` and `API_PROXY_ORIGIN=http://localhost:4100` from inline environment variables at launch, which the committed config didn't include. To prove the stack can be reproduced, both trees were stopped (only after their working directories were checked) and relaunched from `.claude/launch.json` with no inline proxy override.

| Service | URL | PID | Working directory | Canonical match |
|---|---|---|---|---|
| Frontend (next-server) | http://localhost:3000 | 55077 (parent `next dev` 55041, `pnpm` 55016) | `/Users/macbook/Projects/umrah-connects/apps/web` | YES |
| Backend (Nest) | http://localhost:4100/api/v1 | 54992 (parent `nest start --watch` 54797, `pnpm` 54772) | `/Users/macbook/Projects/umrah-connects/platform/api` | YES |
| PostgreSQL | `127.0.0.1:5433` | 717 | `/opt/homebrew/var/postgresql@15` (Homebrew service) | n/a (system service) |

Evidence:
- `GET :4100/api/v1/health` returns 200 with `{"service":"umrah-connect-api","db":"connected"}`.
- `GET :3000/proxy-api/health` returns 200 with the same body, which shows the web server reaches this API through the rewrite.
- `GET :3000/login` returns 200. The page renders with no console errors.
- `POST :3000/proxy-api/auth/login` with the documented local demo account returns 200, so authentication starts up correctly.
- `scripts/verify-workspace.sh --runtime` reports `WORKSPACE: VERIFIED`.

PIDs change on every restart. Re-check them with `scripts/verify-workspace.sh --runtime`.

### Other listeners on this Mac (not Umrah Connect)

Colima (Docker VM, SSH mux PID 3534) forwards `127.0.0.1:4000`, `:5432` and `:6379` to containers that belong to **other local projects**. Port 4000 answers with a different API's `not_found` error. For that reason Umrah Connect must not use 4000 locally. See [LOCAL_WORKSPACE_POLICY.md](LOCAL_WORKSPACE_POLICY.md).

## Database provenance

| Fact | Value |
|---|---|
| Engine | PostgreSQL 15 (Homebrew `postgresql@15`, native, started 2026-09-17 14:46) |
| Data directory | `/opt/homebrew/var/postgresql@15` |
| Host / port / database | `127.0.0.1` / `5433` / `umrah_connects` |
| Config source | `DATABASE_URL` in `platform/api/.env` (host, port and database confirmed; credentials not read into this record) |
| Schema state | `prisma migrate diff --from-schema-datasource --to-schema-datamodel --exit-code` returned exit 0, so the live DB matches `schema.prisma` |
| App connection | Connected (health `db: connected`) |
| Data | Persistent development data (5 tenants, 9 users in `core`) |
| Changes made | None. No reset, push, migration or seed. |

## Environment readiness

Only presence and variable names were checked. No values were printed.

| File | Status | Variables |
|---|---|---|
| `platform/api/.env` | PRESENT, gitignored | NODE_ENV, PORT, DATABASE_URL (required), REDIS_URL, KAFKA_BROKERS, KAFKA_CLIENT_ID, KAFKA_GROUP_ID, KAFKA_ENABLED, JWT_SECRET (required), JWT_REFRESH_SECRET (required), JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, APP_URL, THROTTLE_SHORT_LIMIT, THROTTLE_MEDIUM_LIMIT, THROTTLE_LONG_LIMIT |
| `platform/api/.env.local` | PRESENT (new), gitignored | PORT (local override, no secret) |
| `apps/web/.env.local` | PRESENT, gitignored | NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL, NEXTAUTH_SECRET, NEXTAUTH_URL |
| `apps/web/.env.development.local` | PRESENT (new), gitignored | API_PROXY_ORIGIN (local override, no secret) |
| `.env` (root) | MISSING | Optional. Referenced as a turbo global dependency, but the apps don't read it. |
| `apps/mobile/.env` | MISSING | Optional. Mobile is out of scope. |
| `platform/api/.env.example`, `apps/web/.env.local.example`, `.env.example` | PRESENT, tracked | Templates |

Optional API variables listed in the template but absent locally all have safe development defaults in code: CORS_ORIGINS (falls back to APP_URL), WEB_URL (`http://localhost:3000`), STORAGE_DRIVER (local), PAYMENT_PROVIDER (`sandbox`), SANDBOX_WEBHOOK_SECRET (dev default). `REDIS_URL` isn't consumed by any client in `platform/api/src`, and Kafka is disabled.

A private out-of-repository backup of both env files exists on this Mac. It was byte-identical to the repository copies when checked (SHA-256 compared, values not read). Its location isn't recorded here because the remote is public.

## Previous wrong-folder LOOP00A run

| Fact | Finding |
|---|---|
| Folder selected | `/Users/macbook/Umrah Connect ` (the name ends in a space) |
| What it is | An empty directory, not a Git repository, dated 2026-08-22 |
| What the session did | 8 Bash commands, all read-only diagnostics (`pwd`, `ls`, `stat`, `lsof`, `ps`, `find`, `git status`/`log`, reading the private migration README). It made no Write or Edit calls and no mutating shell commands. |
| Artifacts produced | **None**. No control-tower files, workspace declarations or scripts exist anywhere outside this repository. |
| Classification | ABANDONED WRONG-WORKSPACE RUN, with no artifacts to import |
| Action taken | Nothing imported, nothing deleted. The empty folder and its Claude session history are left as they were. |
| Authority | **Non-authoritative.** Nothing from that run was carried forward. |

## Duplicate repositories

A search of `/Users/macbook` (depth 4, excluding `node_modules` and `Library`) found **one** Git repository whose remote points at `umrahconnects`: this one. No duplicate checkouts or extra worktrees exist.

## Unresolved issues

See the "Unresolved Workspace Risks" section of [LOOP00A_R_HANDOFF.md](LOOP00A_R_HANDOFF.md).
