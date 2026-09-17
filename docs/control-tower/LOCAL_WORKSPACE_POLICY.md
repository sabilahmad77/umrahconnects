# Local Workspace Policy

**Canonical local root:** `/Users/macbook/Projects/umrah-connects`

**Git remote:** `https://github.com/sabilahmad77/umrahconnects.git` (public). **Default branch:** `main`.

Machine-readable form: [`.project/workspace.json`](../../.project/workspace.json). Verification: [`scripts/verify-workspace.sh`](../../scripts/verify-workspace.sh).

## Policy

1. **This repository is the only authoritative local engineering workspace** for Umrah Connect on this Mac.
2. **Claude Code works here.** Sessions open with this folder selected. A session opened on any other folder must stop before changing files.
3. **Codex works here.** The same rule applies.
4. **Localhost is started from here.** The web and API dev servers must run with their working directory inside this repository. A reachable port does not show which checkout is serving it. Check the process's working directory.
5. **GitHub is the remote, not a second workspace.** Nobody edits a separate clone and pushes from it without Control Tower knowing.
6. **No silent duplicate repositories.** Parallel work uses Git worktrees of this repository, and only when Control Tower coordinates it (see [AGENT_WORKSPACE_BOOTSTRAP.md](AGENT_WORKSPACE_BOOTSTRAP.md)).
7. **Prove the Git root before changing anything.** Run `scripts/verify-workspace.sh` first. A non-zero exit means stop.
8. **Production deploys come from reviewed commits.** `main` auto-deploys to Vercel (web) and Render (API), so pushing to `main` counts as a deployment.
9. **Secrets are never committed.** The remote is **public**. Env files stay gitignored. Docs name variables but never show their values.
10. **Local work is never silently discarded.** No `reset --hard`, `checkout --`, `clean`, forced checkout, rebase or history rewrite on someone else's uncommitted or unpushed work without explicit approval.

## Local runtime layout (this Mac)

| Service | URL / port | Runs from |
|---|---|---|
| Web (Next.js 14) | http://localhost:3000 | `apps/web` |
| API (NestJS 10) | http://localhost:4100/api/v1 (health: `/api/v1/health`) | `platform/api` |
| PostgreSQL 15 | `127.0.0.1:5433`, database `umrah_connects` | Homebrew `postgresql@15` (native, not Docker) |

### Why the API uses 4100, not 4000

The code defaults to port 4000 (`platform/api/src/main.ts`), and the README and `start-all.sh` still say 4000. On this Mac, port 4000 (and 5432/6379) is taken by unrelated Docker containers that Colima forwards. If the API started on 4000, the web proxy would send traffic to another project's server.

The fix uses two gitignored, secret-free override files:

| File | Content | Why |
|---|---|---|
| `platform/api/.env.local` | `PORT=4100` | Nest `ConfigModule` loads `.env.local` before `.env` |
| `apps/web/.env.development.local` | `API_PROXY_ORIGIN=http://localhost:4100` | `next.config.mjs` sends `/proxy-api` requests here in dev |

`.claude/launch.json` also declares the API on port 4100.

## Starting the stack

In the Claude desktop app, use the preview launcher with **"API (NestJS)"** and **"Web (Next.js)"** from `.claude/launch.json`.

From a terminal:

```bash
cd /Users/macbook/Projects/umrah-connects
scripts/verify-workspace.sh
pnpm --filter @umrah-connects/api dev
pnpm --filter @umrah-connects/web dev
```

PostgreSQL runs as a Homebrew service (`brew services list`).

## Safe verification commands

```bash
scripts/verify-workspace.sh             # identity, remote, markers, env-file presence
scripts/verify-workspace.sh --runtime   # also: :4100/:3000 served from this repo, DB up, API health
git rev-parse --show-toplevel
git status --short
lsof -a -p "$(lsof -nP -iTCP:4100 -sTCP:LISTEN -t | head -1)" -d cwd
curl -s http://localhost:4100/api/v1/health
curl -s http://localhost:3000/proxy-api/health
pg_isready -h 127.0.0.1 -p 5433
```

All of these are read-only.

## Do not

- Run `next build` or `nest build` while the dev servers are running. They overwrite `.next/` and `dist/`, which the running servers depend on. Stop the servers first or use `tsc --noEmit`.
- Run `prisma migrate reset`, `db:reset`, or a destructive reseed on the local database without explicit approval. It holds persistent development data.
- Run `start-all.sh stop`. It runs broad `pkill -f` patterns and could kill other checkouts' processes.
