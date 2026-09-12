# 08 — Migration Verification

Recorded on the old Mac, 2026-09-12.

## Source

| | |
|---|---|
| Old-Mac repository root | `/Users/macbook/Projects/umrah-connects` |
| Remote | `https://github.com/sabilahmad77/umrahconnects` (**public**) |
| Branch | `main` |
| HEAD before migration | `1b16839` |
| **Migration checkpoint commit** | **`941bfa0fac9c7f3f749f3092d554adf28b364b94`** |
| Push status | **Pushed and verified** — local HEAD == `origin/main` |
| Working tree | **Clean** |

Note on the configured workspace path: Claude Code was launched with a primary
working directory of `/Users/macbook/Umrah Connect ` (with a trailing space).
That directory is **empty** and is not the project. The real workspace is
`~/Projects/umrah-connects`, established before any Git state was touched.

## Branches

| Branch | State | Action |
|---|---|---|
| `main` | The working branch; all project history | Pushed |
| `origin/develop` | **9 commits behind main, 0 ahead** | **Nothing to preserve.** It holds no unique commits, so no work is lost by leaving it. Not fast-forwarded, because changing remote branch state is not required by the migration. Use `main`. |

No local-only branches. No tags (0). No submodules. No Git LFS. No merge or
rebase in progress.

## What was preserved

| Category | Count / note |
|---|---|
| Tracked files total | 514 |
| Web source (`apps/web`) | 186 |
| API source (`platform/api`) | 142 |
| Mobile (`apps/mobile`) | 46 |
| Domain plugin packages | 10 |
| Markdown documentation | 9 (+ 9 migration docs added here) |
| Audit scripts (`.py` / `.js`) | 35 |
| Role sign-off screenshots | 20 (`audit/screens/`) |
| Audit PDFs | 2, tracked |
| Prisma schema | 1 source of truth, 13 schemas |
| Seed scripts | 3 |
| Lockfiles | `pnpm-lock.yaml` + `audit/package-lock.json` |
| Deployment config | `Dockerfile`, `render.yaml`, `docker-compose.yml` |
| Env templates | 3 (`.env.example` ×2 + `.env.local.example`) |

Uncommitted work found at the start: **none**. The working tree was already
clean and in sync, so nothing was at risk of being lost.

## Changes made during the migration

Only two, both preservation-motivated; **no application behaviour was changed**.

1. **`.gitignore`** — removed `.github/workflows/`. No workflow files existed
   (so nothing had been hidden), but the rule would silently drop CI config on a
   future machine move, and its stated reason — a token lacking the `workflow`
   scope — no longer applies, since the current `gh` token has it. Also added a
   note that `audit/screenshots/` never matched the tracked `audit/screens/`.
2. **`platform/api/.env.example`** — added `CORS_ORIGINS` and `WEB_URL`. Both
   are read by `platform/api/src` (`main.ts`, `auth.service.ts`) and were absent
   from the template, so a fresh machine had no record they exist. Both have
   safe code-level fallbacks, so this changes nothing at runtime.

## Runtime discovered on the old Mac

| Tool | Version |
|---|---|
| Node.js | v20.20.2 (repo requires >= 20) |
| pnpm | 9.12.0 (pinned by `packageManager`) |
| npm | 10.8.2 |
| PostgreSQL | 15.19 (Homebrew), **running on port 5433** |
| Python | 3.9.6 (system) with `requests` |
| Git | 2.50.1 (Apple) |
| GitHub CLI | 2.97.0, authenticated as `sabilahmad77` (scopes: gist, read:org, repo, workflow) |
| Docker | 29.7.2 (not needed for local dev) |
| Homebrew | 6.0.22 |

**Port 5433 is a machine-specific quirk, not a project requirement.** An
unrelated SSH tunnel held `127.0.0.1:5432` on the old Mac. The committed
template uses 5432; the new Mac should check the port before choosing.

## Services discovered

| Service | State (checked live 2026-09-12) |
|---|---|
| Vercel frontend — https://umrahconnect.io | **HTTP 200, up** |
| Render API — https://umrah-connect-api.onrender.com | **HTTP 000, down** (see doc 03) |
| `www.umrahconnect.io` | **HTTP 000** — no DNS record |
| CI/CD | **None** — no `.github/` directory |

## Secret handling

- Full scan for `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`,
  `credentials*.json`, `service-account*.json`, keystores → **only two local env
  files**, both already gitignored.
- Both scanned for secret-shaped values (`sk_live`, `sk_test`, `AKIA…`, `ghp_`,
  `xox…`, PEM headers, passworded connection strings) → **zero matches**. All
  values are development placeholders.
- Staged-content secret scan before committing → **clean**.
- Files tracked in Git matching env/key patterns → **only the three `.example`
  templates**.
- **No secret has ever been committed**, and none exists on this Mac to leak.
  Production secrets live in the Vercel and Render dashboards.

Private handoff: `~/Desktop/UMRAH_CONNECT_PRIVATE_MIGRATION/`
(outside the repository, marked do-not-upload, copies are `chmod 600`, originals
untouched). It is **optional** — see doc 07.

## Reproducibility rehearsal

A fresh clone was taken from GitHub into a temporary directory, with nothing
copied from the working tree, and it:

- contained every expected manifest, lockfile, schema, seed, template, doc,
  deployment file and audit script (checked individually);
- completed `pnpm install --frozen-lockfile` in 10.9 s — proving the lockfile
  matches the manifests with no drift;
- generated the Prisma client and passed `prisma validate`;
- completed `nest build` producing `dist/src/main.js`;

all **without any `.env` file and without a database**. The temporary clone was
then deleted; the original project was untouched.

This rehearsal ran against `1b16839`, immediately before the checkpoint commit.
The checkpoint only **adds** documentation and corrects `.gitignore` and an env
template, so it cannot reduce completeness — and the migration docs were
confirmed present on `origin/main` after pushing.

## Known risks carried forward

| Risk | Severity | Note |
|---|---|---|
| Render API down | Medium | Needs the Render dashboard. Not a code fault; local dev unaffected. |
| `www` has no DNS record | Low | Apex works. |
| Uploads on ephemeral local disk | Medium in production | Storage abstraction is ready; needs Cloudinary/S3 keys. |
| No CI | Low | On the roadmap; `.gitignore` no longer blocks it. |
| Prisma 5 → 7 upgrade available | Low | Deliberately **not** done. Out of scope for a migration. |
| `develop` branch is stale | Low | 9 commits behind, nothing unique. Use `main`. |

## Verification status

**PASS.** The public repository is sufficient to reconstruct, build and run
Umrah Connect on a new Mac. The private handoff is a convenience, not a
dependency.
