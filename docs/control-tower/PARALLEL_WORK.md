# Parallel work — ownership between tracks

| Track | Worktree | Branch | Owns |
|---|---|---|---|
| Claude core | `/Users/macbook/Projects/umrah-connects-core-finalization` | `claude/core-finalization` | `platform/api/**`, `prisma`, `infrastructure/**`, `Dockerfile`, `.dockerignore`, `.github/workflows/api-ci.yml`, env templates (except web), `docs/control-tower/**`, `docs/adr/**`, `audit/core_runtime_qa.py`, `render.yaml` |
| Codex web | `/Users/macbook/Projects/umrah-connects-web-finalization` | `codex/web-frontend-finalization` | `apps/web/**`, `docs/ui-ux/**` |
| Shared (coordinate before editing) | — | — | `pnpm-lock.yaml` (both add dependencies), root `package.json`, `README.md`, `.gitignore` |

The core track changed nothing under `apps/web`. Frontend needs are in CROSS_TRACK_REQUESTS.md.

**Merge order recommendation:** merge `claude/core-finalization` first. Codex rebases and resolves `pnpm-lock.yaml` by re-running `pnpm install`. Codex ships the P1 cross-track items before the combined build is deployed, because the hardened API breaks some current web flows by design (XT-R10).

**Local database separation:** core uses `umrah_connects_core` and `umrah_connects_test`; `main` keeps `umrah_connects`. `umrah_connects` has **not** been migrated. Run `prisma migrate resolve --applied 20260917000000_baseline`, then `migrate deploy` and `sync-rbac`, after merging.
