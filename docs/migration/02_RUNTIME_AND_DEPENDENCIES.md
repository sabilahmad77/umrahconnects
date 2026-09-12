# 02 — Runtime and Dependencies

Versions below are either **pinned in the repository** or **observed on the old
Mac**. Both are stated so the new Mac can match deliberately.

## MUST INSTALL ON THE NEW MAC

| Tool | Required | Old Mac had | Evidence | Install |
|---|---|---|---|---|
| Homebrew | any recent | 6.0.22 | — | https://brew.sh |
| Git | any recent | 2.50.1 (Apple) | — | Xcode CLT or `brew install git` |
| GitHub CLI | any recent | 2.97.0 | needed to clone/verify | `brew install gh` |
| **Node.js** | **>= 20.0.0** | **v20.20.2** | `engines.node` in root `package.json` | `brew install node@20` |
| **pnpm** | **>= 9.0.0**, pinned **9.12.0** | 9.12.0 | `packageManager: pnpm@9.12.0`, `engines.pnpm` | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| **PostgreSQL** | **15** | 15.19 (Homebrew) | README; `Dockerfile` uses Prisma against PG; multiSchema needs a modern PG | `brew install postgresql@15` |
| Python 3 | 3.9+ | 3.9.6 (system) | `audit/*.py` verification suites | preinstalled on macOS |
| `requests` (Python) | any | installed | every `audit/*.py` imports it | `pip3 install --user requests` |
| Google Chrome | any recent | installed | `audit/*.js` drive it via `playwright-core` at the system Chrome path | https://google.com/chrome |

### Not required to run the app

| Tool | Note |
|---|---|
| Docker | 29.7.2 on the old Mac. Only needed for `docker compose` or building the production API image. Local dev does **not** use it. |
| Redis | `REDIS_URL` is present but nothing requires a live Redis for local dev. |
| Kafka | Off by default (`KAFKA_ENABLED=false`). The API logs `Kafka disabled — skipping connection`. |
| Xcode / Android SDK / CocoaPods | Only for `apps/mobile` native builds. Expo Go covers normal mobile dev. Mobile is **not** at parity and is not part of the standard local workflow. |

## PROJECT DEPENDENCIES — INSTALLED AUTOMATICALLY

One command at the repo root installs every workspace:

```bash
pnpm install
```

Lockfile: `pnpm-lock.yaml` (committed, ~630 KB). **Do not regenerate it.**
Use plain `pnpm install`; on CI prefer `pnpm install --frozen-lockfile`.

The `audit/` directory has its **own** `package.json` + `package-lock.json` and
is **not** part of the pnpm workspace. Its browser proofs need a separate,
one-time npm install:

```bash
cd audit && npm install     # installs playwright-core 1.49
```

`playwright-core` drives the **system Chrome** at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` — it does not
download its own browser, so Chrome must be installed.

## Pinned framework versions

| Package | Version | Where |
|---|---|---|
| next | ^14.2.16 | `apps/web` |
| react / react-dom | ^18.3.1 | `apps/web` |
| @tanstack/react-query | ^5.59.0 | `apps/web` |
| tailwindcss | ^3.4.14 | `apps/web` |
| @nestjs/core | ^10.4.0 | `platform/api` |
| prisma / @prisma/client | ^5.20.0 (resolved 5.22.0) | `platform/api` |
| class-validator | ^0.14.1 | `platform/api` |
| expo | ^54.0.0 | `apps/mobile` |
| react-native | 0.81.4 | `apps/mobile` |
| turbo | ^2.3.0 | root |
| typescript | ^5.9.3 | root |

Prisma prints an upgrade notice for 7.x. **Do not upgrade during migration** —
it is a major version with breaking changes and is out of scope.

## Command reference

| Purpose | Command |
|---|---|
| Install everything | `pnpm install` |
| API dev (port 4000) | `pnpm --filter @umrah-connects/api dev` |
| Web dev (port 3000) | `pnpm --filter @umrah-connects/web dev` |
| API production build | `pnpm --filter @umrah-connects/api exec nest build` |
| Web production build | `pnpm --filter @umrah-connects/web exec next build` |
| Typecheck | `pnpm typecheck` (or per-package `tsc --noEmit`) |
| Prisma client | `cd platform/api && npx prisma generate` |
| Push schema | `cd platform/api && npx prisma db push` |

**Both production builds must pass before any push to `main`** — `main`
auto-deploys.

### A build-gate gotcha worth knowing

Running `next build` while `next dev` is running overwrites `.next` and makes
the dev server start returning 500s (`Cannot find module './<chunk>.js'`).
After a build gate, restart the web dev server:

```bash
rm -rf apps/web/.next
pnpm --filter @umrah-connects/web dev
```
