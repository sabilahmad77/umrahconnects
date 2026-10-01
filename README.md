# Umrah Connect

Multi-tenant, role-based SaaS + marketplace for the Umrah ecosystem — operators,
hotels, transport companies, visa agencies, finance teams, pilgrims, and a
central Super Admin.

- **Live web:** https://umrahconnect.io (Vercel, auto-deploys from `main`)
- **API hosting:** Hostinger KVM 8 (Docker Compose + Caddy + PostgreSQL 16) — see **[infrastructure/kvm/README.md](infrastructure/kvm/README.md)**. Render is retired from the target architecture; the legacy service is decommissioned only after an authorized cutover (docs/control-tower/RENDER_RETIREMENT.md).
  see **[infrastructure/kvm/README.md](infrastructure/kvm/README.md)**
- **Engineering control tower (security model, decisions, evidence):** **[docs/control-tower/](docs/control-tower/CONTROL_TOWER.md)**
- **Full project picture, state of work, credentials map, and roadmap:**
  **[docs/HANDOFF.md](docs/HANDOFF.md)** ← read this first on a new machine.
- **Setting this up on a new Mac?** See **[docs/migration/](docs/migration/)** —
  architecture, exact runtime versions, deployment state, local setup, database,
  environment variables, and a ready-to-paste bootstrap prompt
  ([09_NEW_MAC_BOOTSTRAP_PROMPT.md](docs/migration/09_NEW_MAC_BOOTSTRAP_PROMPT.md)).

## Repo layout (pnpm + turbo monorepo)

| Path | What |
|---|---|
| `apps/web` | Next.js 14 App Router frontend (TanStack Query, Tailwind) |
| `platform/api` | NestJS 10 API (Prisma 5 + Prisma Migrate, PostgreSQL 13-schema multiSchema, capability RBAC) |
| `infrastructure/kvm` | Production stack for Hostinger KVM 8 (Docker Compose, Caddy, PostgreSQL 16, backups) |
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
npx prisma migrate deploy                     # committed migrations (never `db push`)
npx ts-node prisma/seed.ts                    # tenants + operator admins (Admin@1234)
npx ts-node prisma/seed-modules.ts            # hotels, transport, finance, visa demo data
npx ts-node prisma/seed-marketplace.ts        # marketplace vendors + listings
npx ts-node prisma/scripts/sync-rbac.ts       # capability catalogue + system roles
npx ts-node prisma/scripts/seed-demo-roles.ts # one account per role (dev only)
cd ../..
# Existing databases created with `db push`: run once
#   npx prisma migrate resolve --applied 20260917000000_baseline && npx prisma migrate deploy

# 4. Run (two terminals, or background both)
pnpm --filter @umrah-connects/api dev   # API  → http://localhost:4000/api/v1/health (4100 on the team Mac)
pnpm --filter @umrah-connects/web dev   # Web  → http://localhost:3000
```

Sign in at http://localhost:3000/login with `admin@alharamain.sa` / `Admin@1234`
(email-first login — no tenant/workspace field). On localhost a **Quick Demo
Access** tab also offers one-click role logins; it is hidden on production
hosts by design.

## Quality gate

```bash
pnpm --filter @umrah-connects/api typecheck
pnpm --filter @umrah-connects/api lint
pnpm --filter @umrah-connects/api exec vitest run                                   # unit
pnpm --filter @umrah-connects/api exec vitest run --config vitest.e2e.config.ts     # security e2e (uses umrah_connects_test)
```

## Deploying

Pushing to `main` deploys the web app (Vercel). The API is deployed to Hostinger KVM 8 from reviewed commits with
`infrastructure/kvm/scripts/deploy.sh` (backup → migrate → start → health check). Run the quality gate and
both production builds first:

```bash
pnpm --filter @umrah-connects/web exec next build
pnpm --filter @umrah-connects/api exec nest build
```
