# LOOP00A-R Recovery Handoff

Date: 2026-09-17 · Agent: Claude Code (Opus 5) · Scope: local workspace recovery, provenance and reproducibility only. No product, security or UI changes were made.

## Correct Canonical Workspace

`/Users/macbook/Projects/umrah-connects`. `pwd`, `pwd -P` and `git rev-parse --show-toplevel` all resolve to this path. Project identity is confirmed from the manifests, the source layout, the Prisma schema, the plugins and the API's own health response. Details: [WORKSPACE_PROVENANCE.md](WORKSPACE_PROVENANCE.md).

## Git Provenance

- Remote: `https://github.com/sabilahmad77/umrahconnects.git` (**public**)
- Branch `main`, HEAD `65ce3dc`. HEAD is 1 commit ahead of `origin/main` (`f71a6de`) and 0 behind. The local-only commit is the 2026-09-17 audit baseline and hasn't been pushed.
- One worktree, no submodules, no stashes. The tree was clean at the start.
- No reset, checkout, rebase, merge, push or history rewrite was performed.

## Runtime Provenance

| Service | URL | Working directory | Match |
|---|---|---|---|
| Web | http://localhost:3000 | `…/umrah-connects/apps/web` | YES |
| API | http://localhost:4100/api/v1 | `…/umrah-connects/platform/api` | YES |

Both were restarted from `.claude/launch.json` to prove the stack can be reproduced. The web server reaches the API through `/proxy-api` without any inline environment. The login page renders, and a login through the proxy returns 200.

## Database Provenance

Native Homebrew PostgreSQL 15 at `127.0.0.1:5433`, database `umrah_connects`. It holds persistent development data (5 tenants, 9 users). The live schema matches `schema.prisma` (drift check exit 0), and the application is connected. Nothing in the database was changed.

## Environment Readiness

The required env files (`platform/api/.env`, `apps/web/.env.local`) are present and gitignored, and no env file is tracked. Optional template variables have safe code defaults. Two gitignored, secret-free port overrides were added (see below). No secret values were printed or written anywhere.

## Previous Wrong-Folder Run

The previous LOOP00A attempt was interrupted because the wrong folder was selected (`/Users/macbook/Umrah Connect `, an empty non-Git directory whose name ends in a space). It is not an authoritative workspace record.

That session ran only read-only diagnostics and left **no artifacts**. Nothing was imported and nothing was deleted.

## Files Created/Corrected

| File | Change | Tracked |
|---|---|---|
| `docs/control-tower/LOCAL_WORKSPACE_POLICY.md` | new | yes (uncommitted) |
| `docs/control-tower/WORKSPACE_PROVENANCE.md` | new | yes (uncommitted) |
| `docs/control-tower/AGENT_WORKSPACE_BOOTSTRAP.md` | new | yes (uncommitted) |
| `docs/control-tower/LOOP00A_R_HANDOFF.md` | new | yes (uncommitted) |
| `.project/workspace.json` | new | yes (uncommitted) |
| `scripts/verify-workspace.sh` | new, executable. Tested: canonical root exits 0; empty wrong folder, unrelated repo and non-git directory exit 1. | yes (uncommitted) |
| `.claude/launch.json` | API port changed from 4000 to 4100 | yes (uncommitted) |
| `platform/api/.env.local` | new: `PORT=4100` | gitignored |
| `apps/web/.env.development.local` | new: `API_PROXY_ORIGIN=http://localhost:4100` | gitignored |

Nothing was committed, pushed or deployed.

## Existing Product Defects Observed

Recorded only. Do not remediate them here.

1. **No automated tests.** `vitest run` finds no test files in `platform/api` or `apps/web` (exit 1). Both `test` scripts fail.
2. **No CI configuration.** `.github/` doesn't exist, although a `.gitignore` comment says workflows are tracked. `main` auto-deploys with no CI gate.
3. Typecheck passes for API and web (`tsc --noEmit`, 0 errors). Lint and production builds weren't run, because builds would overwrite the live dev servers' `.next/` and `dist/`.
4. `apps/web/tsconfig.tsbuildinfo` is a tracked build artifact, so every typecheck dirties the tree. The typecheck here modified it, and the file was restored to HEAD.
5. The broader product backlog (security, RBAC, tenancy and more) is already in `docs/audit/` and is not repeated here.

## Unresolved Workspace Risks

1. **The local port layout differs from the docs.** `README.md`, `docs/migration/04_LOCAL_DEVELOPMENT.md` and `start-all.sh` still say API port 4000. On this Mac, 4000 belongs to another project's container. The fix lives in gitignored overrides and `launch.json`, so a fresh clone would need them recreated. `docs/audit/` already records 4100.
2. **`start-all.sh` is stale for this Mac.** It uses Intel Homebrew paths (`/usr/local/...`, while this Mac uses `/opt/homebrew`), port 4000, broad `pkill -f` patterns on `stop`, and a hard-coded demo credential and tenant ID. Don't use it until it's reconciled.
3. **`.claude/settings.local.json` is tracked.** It contains permission entries with another machine's absolute paths (`/Users/ahmadsabil77/...`). Machine-local settings shouldn't be committed.
4. `REDIS_URL` points to `localhost:6379`, which is another project's Redis. No client uses it today, so it becomes a collision risk if Redis is wired up.
5. The local-only commit `65ce3dc` and the LOOP00A-R files aren't on GitHub yet. Pushing to `main` triggers production deploys, so it needs an explicit decision.
6. `prisma` warns that 5.22 is outdated. That's informational only.
7. The two gitignored override files exist only on this Mac and aren't in the private env backup.

## Verification Command

```bash
cd /Users/macbook/Projects/umrah-connects && scripts/verify-workspace.sh --runtime
```

Expected final line: `WORKSPACE: VERIFIED` (a "with warnings" suffix is fine while LOOP00A-R files are uncommitted).

## Readiness for LOOP00

Ready. The canonical workspace, Git provenance, runtime provenance, database provenance and environment readiness are all established and can be re-verified with one command. LOOP00 should first decide whether to commit the LOOP00A-R files and whether and when to push `main`, since pushing deploys to production. Risks 1–3 are good candidates for early governance items.

LOOP00A-R GATE: PASS
