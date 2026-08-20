# Umrah Connect

Multi-tenant, role-based SaaS + marketplace for the Umrah ecosystem — operators,
hotels, transport companies, visa agencies, finance teams, pilgrims, and a
central Super Admin.

- **Live web:** https://umrahconnect.io (Vercel, auto-deploys from `main`)
- **Live API:** https://umrah-connect-api.onrender.com/api/v1 (Render, auto-deploys from `main`)
- **Full project picture, state of work, credentials map, and roadmap:**
  **[docs/HANDOFF.md](docs/HANDOFF.md)** ← read this first on a new machine.

## Repo layout (pnpm + turbo monorepo)

| Path | What |
|---|---|
| `apps/web` | Next.js 14 App Router frontend (TanStack Query, Tailwind) |
| `platform/api` | NestJS 10 API (Prisma 5, PostgreSQL 13-schema multiSchema) |
| `apps/mobile` | Expo app (not yet at parity) |
| `audit/` | Playwright/Python verification + seed-proof scripts with evidence |
| `IMPLEMENTATION_LOG.md`, `STATUS.md` | Living evidence log of every verified fix |

## Quick start (fresh machine)

Prereqs: Node ≥ 20 (22 works), pnpm 9.12, PostgreSQL 15, Google Chrome
(for audit scripts), Python 3 with `requests`.

```bash
git clone https://github.com/sabilahmad77/umrahconnects.git
cd umrahconnects
pnpm install

# 1. Postgres
createuser umrah
createdb umrah_connects -O umrah

# 2. Env files (dev-ready templates)
cp platform/api/.env.example platform/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# 3. Schema + demo data
cd platform/api
npx prisma generate
npx prisma db push          # no migrations dir — schema-push workflow
npx ts-node prisma/seed.ts             # tenants + admin users (Admin@1234)
npx ts-node prisma/seed-modules.ts     # role/module permissions
npx ts-node prisma/seed-marketplace.ts # marketplace vendors + listings
cd ../..

# 4. Run (two terminals, or background both)
pnpm --filter @umrah-connects/api dev   # API  → http://localhost:4000/api/v1/health
pnpm --filter @umrah-connects/web dev   # Web  → http://localhost:3000
```

Sign in at http://localhost:3000/login with `admin@alharamain.sa` / `Admin@1234`
(email-first login — no tenant/workspace field). On localhost a **Quick Demo
Access** tab also offers one-click role logins; it is hidden on production
hosts by design.

## Deploying

Push to `main` → GitHub → Vercel (web) + Render (API) auto-deploy. Always run
both production builds first:

```bash
pnpm --filter @umrah-connects/web exec next build
pnpm --filter @umrah-connects/api exec nest build
```
