# Umrah Connect — new Mac handoff

## The short prompt (paste this into Claude Code on the new Mac)

```text
Clone https://github.com/sabilahmad77/umrahconnects.git on branch engineering/100-loop into ~/Projects/umrah-connects, then open NEW_MAC_HANDOFF.md at the repo root and carry out its "Claude Code: start here" procedure from beginning to end. That file has the full project context, the exact commands, the checks and the rules. Ask me only for things that need my password or an account sign-in, and finish with the report it asks for.
```

---

| | |
|---|---|
| Project | Umrah Connect: a multi-tenant SaaS and marketplace for the Umrah ecosystem (travelers, operators, hotels, transport, visa agencies, finance, platform Super Admin) |
| Repository | **https://github.com/sabilahmad77/umrahconnects** (public) |
| Branch to use | **`engineering/100-loop`** (the complete, verified codebase) |
| Do not use | `main` or `develop`. They hold old code, and `main` is what production currently runs. |
| Verified | 2026-10-01 by a dry run: a fresh clone of this branch, then install, migrate, runtime role, seeds, API and web up, sign-in in a browser, and the full test gate. All green. |

---

## Claude Code: start here

You are setting up an existing, finished-to-engineering-acceptance project on a fresh Mac.
Do **not** redesign, refactor or "improve" anything during setup. The goal is one clean
local install that matches the verified state. Work through the steps in order; each one has
a check, and you move on only when it passes.

**Ask the owner only for:** anything needing their macOS password (installing Homebrew or the
Xcode command-line tools), and account sign-ins (`gh auth login`). Everything else you do yourself.

**Never:** push to `main` (it auto-deploys umrahconnect.io on Vercel), deploy anything, change
DNS, touch Render, commit any `.env*` file or credential (the repository is **public**), or
print a secret in a reply.

### Step 0 — Be in the repository

If the repo is not cloned yet:

```bash
git clone --branch engineering/100-loop https://github.com/sabilahmad77/umrahconnects.git ~/Projects/umrah-connects
cd ~/Projects/umrah-connects
```

Check: `git rev-parse --abbrev-ref HEAD` prints `engineering/100-loop`. Then read sections A–E
below once for context before continuing.

### Step 1 — Prerequisites

Check each; install only what is missing (Apple Silicon paths shown).

```bash
xcode-select -p || xcode-select --install          # owner may need to click through the installer
command -v brew || echo "ASK THE OWNER to install Homebrew (it needs their password)"
#   official installer, to be run by the owner in Terminal:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node@22 postgresql@15 gh
brew link --overwrite --force node@22               # versioned formulae are not on PATH until linked
brew link --overwrite --force postgresql@15
brew services start postgresql@15
corepack enable && corepack prepare pnpm@9.12.0 --activate
gh auth status || echo "ASK THE OWNER to run: gh auth login   (GitHub account sabilahmad77)"
```

Check: `node -v` reports v22 or later (v20 or later works; v22 was verified), `pnpm -v` reports
`9.12.0`, `psql --version` reports 15, and `pg_isready` says "accepting connections".
Optional: Docker Desktop or colima (only for the provider test stand-ins) and Google Chrome
(only for the browser QA scripts).

### Step 2 — Databases

```bash
createdb umrah_connects_dev
createdb umrah_connects_test      # the e2e suite resets this one on every run; the name must end in _test
```

Check: `psql -l` lists both. If port 5432 is already taken by something else, use the port your
PostgreSQL is actually on in every URL below.

### Step 3 — Environment files (fresh secrets, never committed)

Generate two secrets with `openssl rand -hex 32` (JWT secrets) and one with `openssl rand -hex 24`
(runtime database password). Create these three files.

`platform/api/.env`:

```bash
NODE_ENV=development
PORT=4000
# Migrations and seeds run as the owner (your macOS user, a superuser in Homebrew PostgreSQL).
MIGRATE_DATABASE_URL=postgresql://<your-mac-username>@127.0.0.1:5432/umrah_connects_dev?schema=public
# The API itself runs as a NON-superuser role, otherwise row-level security is silently bypassed.
DATABASE_URL=postgresql://uc_app:<runtime-password>@127.0.0.1:5432/umrah_connects_dev?schema=public
JWT_SECRET=<hex secret 1>
JWT_REFRESH_SECRET=<hex secret 2>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
WEB_URL=http://localhost:3000
APP_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
STORAGE_DRIVER=local
PAYMENT_PROVIDER=sandbox
MAIL_DRIVER=log
KAFKA_ENABLED=false
AUTH_REFRESH_TOKEN_IN_BODY=false
THROTTLE_DISABLED=false
```

`apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=/proxy-api
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`apps/web/.env.development.local`:

```bash
API_PROXY_ORIGIN=http://localhost:4000
```

Check: `git status --short` shows none of these files. They are gitignored; if one appears, stop
and fix `.gitignore` before anything else.

### Step 4 — Install, migrate, create the runtime role, seed

```bash
cd ~/Projects/umrah-connects
pnpm install --frozen-lockfile
cd platform/api
npx prisma generate

# Read the owner URL from .env into this shell (a fresh shell does not have it).
export MIGRATE_DATABASE_URL="$(grep '^MIGRATE_DATABASE_URL=' .env | cut -d= -f2-)"

# 1. Migrations, as the owner (12 migrations; never `prisma db push`).
DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy

# 2. The runtime role the API connects as (use the same password as in DATABASE_URL).
UC_RUNTIME_LOGIN=uc_app UC_RUNTIME_PASSWORD='<runtime-password>' \
  psql "${MIGRATE_DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f prisma/rls/runtime-role.sql

# 3. Seeds, as the owner, in this order.
export DATABASE_URL="$MIGRATE_DATABASE_URL"
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-modules.ts
npx ts-node prisma/seed-marketplace.ts
npx ts-node prisma/scripts/sync-rbac.ts
npx ts-node prisma/scripts/seed-demo-roles.ts        # one account per role, password Admin@1234 (local only)
npx ts-node prisma/scripts/seed-isolation-pairs.ts   # a second organization of each type
npx ts-node prisma/scripts/seed-qa-identities.ts     # 15 QA accounts, random passwords → .project/local/qa-credentials.json (mode 0600)
unset DATABASE_URL
```

Checks: `migrate deploy` ends with "All migrations have been successfully applied"; the role
script's last line reads `uc_app | f | f | f` (not superuser, no RLS bypass, not an owner); every
seed exits 0; `.project/local/qa-credentials.json` exists with mode `-rw-------`.

### Step 5 — Run and verify

In two terminals (or as background processes you track):

```bash
pnpm --filter @umrah-connects/api dev     # http://localhost:4000/api/v1/health
pnpm --filter @umrah-connects/web dev     # http://localhost:3000
```

Checks, all required:

- `curl http://localhost:4000/api/v1/health` returns `"status":"ok"` and `"db":"connected"`.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login` returns `200`.
- `curl http://localhost:3000/proxy-api/health` returns the same health JSON (the web proxy works).
- Signing in through the **real form** at http://localhost:3000/login as `admin@alharamain.sa`
  / `Admin@1234` lands on `/dashboard` (the operator workspace, deep-green sidebar, seeded figures).
- `psql -d postgres -Atc "select distinct usename from pg_stat_activity where datname='umrah_connects_dev'"`
  shows `uc_app`, not your superuser.

### Step 6 — Quality gate

```bash
cd ~/Projects/umrah-connects/platform/api
npx tsc --noEmit && pnpm lint && npx vitest run
npx vitest run --config vitest.e2e.config.ts             # resets umrah_connects_test; runs as uc_app
cd ../../apps/web
npx tsc --noEmit && npx eslint app components hooks lib middleware.ts && npx vitest run
NODE_ENV=production API_PROXY_ORIGIN=http://localhost:4000 npx next build
```

Expected (from the verification dry run):

- API unit **201** passed.
- API e2e **553** tests: 548 pass and 5 are skipped. The skipped 5 are the stripe-mock tests; they
  pass when `STRIPE_MOCK_URL` points at a running stripe-mock (see `docs/control-tower/LOCAL_TEST_GUIDE.md`).
- Web **255** passed, and the production build succeeds.
- Typecheck and lint are clean everywhere.

Report any difference with the exact output. Do not change tests or code to make numbers match.

Note: the production build refuses to start without `API_PROXY_ORIGIN`. That is deliberate.

### Step 7 — Report to the owner

Give: the local URLs; the start and stop commands; the test results against the expected numbers;
anything that needed the owner; and a reminder of owner action **E1** (revoking the exposed Render
key) if they have not confirmed it is done. Leave the API and web running.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `prisma migrate deploy`: "the URL must start with postgresql://" | `MIGRATE_DATABASE_URL` is not exported in this shell; rerun the `export` line in Step 4. |
| Role script prints `t` in any column | `DATABASE_URL` is pointing at a superuser. The API must use `uc_app`. |
| QA seed refuses the database | The name must look local (`umrah_connects_dev` does). To allow another name deliberately, set `QA_SEED_ALLOW_DATABASE=<exact name>`. |
| API fails at boot with `role "uc_app" does not exist` or an authentication error | The runtime role was not created, or its password differs from the one in `DATABASE_URL`. Rerun Step 4.2 with the same password. |
| API answers 500 and its log shows `permission denied for table …` | The runtime role exists but has no grants on this database (for example after recreating it). Rerun Step 4.2; it reapplies the grants. |
| Port 3000, 4000 or 5432 busy | Change `PORT`/`WEB_URL`/`CORS_ORIGINS`/`API_PROXY_ORIGIN` consistently, or the PostgreSQL port in both URLs. |
| `pnpm` is not 9.12.0 | `corepack prepare pnpm@9.12.0 --activate` (or `npm i -g pnpm@9.12.0`). |

---

## A. Where things are

| Thing | Where | Notes |
|---|---|---|
| **Code** | GitHub, branch `engineering/100-loop` | Also pushed as history labels: `integration/web-final`, `claude/core-finalization` and `codex/web-frontend-finalization`. All three are already contained in `engineering/100-loop`. |
| **Domain and web hosting** | Vercel, `umrahconnect.io` | Auto-deploys from `main` only. Still serves the **old** code, whose API is the dead Render service. |
| **API hosting (target)** | Hostinger KVM 8 | Fully prepared in `infrastructure/kvm/`. **Not provisioned or deployed yet.** |
| **API hosting (legacy)** | Render service `umrah-connect-api` | Retired from the target. Still exists and is unresponsive. Decommission it only after cutover. |
| **Production database** | **None exists.** | The Render account holds no PostgreSQL (checked through the Render API). There is no production data to migrate. |
| **Development data** | Local PostgreSQL | Development and QA data only, rebuilt by the seeds. Nothing irreplaceable. |
| **Secrets** | Never in the repository | Every `.env*` file is gitignored, and local secrets are generated fresh. No Google, Stripe, R2 or SMTP credentials exist yet. |

Left behind on the old Mac on purpose: its `.env` files (regenerated), its local databases
(rebuilt by the seeds), its QA credential file (regenerated with new passwords) and its
`.claude/settings.local.json` files. **Never copy those last ones: they contain the exposed Render
key.** All worker worktrees and Codex's uncommitted work are already inside `engineering/100-loop`.

## B. Current state (2026-10-01)

**Verdict: ENGINEERING COMPLETE — LAUNCH BLOCKED.**

| Measure | Value |
|---|---|
| Engineering acceptance | **155 / 155 = 100.0** |
| Ready-to-launch | **155 / 169 = 91.7**. The 14 open rows are all owner actions (section E). |
| Historical requirements | 117 / 131. The remaining 14 are the same external obligations. |
| Mandatory gates | G2–G7 PASS · G1 FAIL (the exposed Render key is still live) · G8 BLOCKED (no provider credentials or server yet) |
| Browser QA | 87/87 routes and 3,329 checks in actual Chrome across 18 identities; no P0 or P1 found |
| Accessibility | axe WCAG 2.2 AA: 0 violations. A real Orca screen-reader session was run. |
| Defects | 40 fixed in the last loop; 3 open, all minor |

Full record: `docs/control-tower/`. Read `ENGINEERING_100_FINAL_REPORT.md` first, then
`PROVIDER_ACTIVATION_CHECKLIST.md`, `ENGINEERING_100_DEFECTS.md` and `DECISIONS.md` (D-001 … D-025).

## C. Architecture

pnpm workspace + Turborepo monorepo.

```
apps/web/            Next.js 14 frontend (App Router)
apps/mobile/         Expo app: NOT at parity, out of scope for now
platform/api/        NestJS 10 API + Prisma 5 (PostgreSQL)
infrastructure/kvm/  Production stack for Hostinger KVM 8 (Compose, Caddy, PostgreSQL 16, scripts, systemd units)
plugins/             Plugin packages (loaded by the API's plugin host)
audit/               QA harnesses: acceptance QA (Python), browser scripts, register tooling (audit/eng100/)
docs/control-tower/  Engineering record: register, scorecards, decisions, blockers, evidence
docs/ui-ux/          Design system and design decisions
.github/workflows/   api-ci.yml, infra-ci.yml, uptime.yml
```

### Frontend, `apps/web`

| Path | What lives there |
|---|---|
| `app/` | 87 route templates. Public marketing pages at the root. Auth: `/login`, `/reset-password`, `/signup`, `/verify-email`, `/auth/callback`. The signed-in workspace is in `app/(dashboard)/`: traveler, operator, hotel, transport, visa, finance, Super Admin, `/settings`, `/onboarding`, `/notifications`. |
| `components/ui/system.tsx` | The design system: Button, Input, Select, Dialog, Alert, Card, PageHeader, FileUpload, LoadingState, QueryFailure, Tooltip. Build every screen from these. |
| `components/layout/` | Workspace shell, sidebar, header, notification bell, email-verification banner. |
| `components/<domain>/` | One folder per area (admin, bookings, finance, hotels, marketplace, onboarding, pilgrims, social, transport, travel-plan, …). |
| `hooks/` | TanStack Query hooks per domain, plus `use-capabilities.ts` (every UI permission check). |
| `lib/api.ts` | Axios client to `/proxy-api` (same origin). Handles silent refresh via the httpOnly cookie, single-flight writes, and `Idempotency-Key` on creates. |
| `lib/workspace-access.ts` | The one route→capability table, used for navigation, route guards and landing pages. Never authorize by role name. |
| `middleware.ts` | Adds the proxy secret and the real client IP to `/proxy-api/*` requests. |
| `next.config.mjs` | Rewrites `/proxy-api/*` to `API_PROXY_ORIGIN/api/v1/*`. |
| `tailwind.config.ts`, `app/globals.css` | Brand palette: deep green `brand`, `gold`, `ivory`, `navy`, `midnight`. |
| `public/` | Logos. The approved hero image is expected at `public/images/hero/makkah-approved.webp` and has not been supplied yet. |

### Backend, `platform/api`

| Path | What lives there |
|---|---|
| `src/main.ts`, `src/bootstrap/` | Bootstrap and environment validation (refuses unsafe production config, including any Render URL). Client-IP trust. Swagger at `/api/docs` in development only. |
| `src/common/` | Guards (JWT, capabilities, throttling). Decorators: `@Public`, `@RequirePermissions`, `@AnyAuthenticated`, `@PublicWithOptionalUser`. Error filter, audit and **idempotency** interceptors, tenant-scope helpers. A route without a declared policy stops the API from booting. |
| `src/prisma/` | PrismaService plus **row-level security**: `db-context.ts` (request scope: tenant / platform / system), `rls-extension.ts`, and `rls-tables.ts` (every table classified). Crossing organizations needs `withSystemScope(reason)`, with the reason taken from a closed list. |
| `src/modules/` | 31 modules: admin, audit, auth (password, Google OIDC, verification, sessions), bookings, compliance (visa cases), connections, events, finance, groups, health, hotels, inquiries, mail, marketplace, marketplace-requests, notifications, payments (sandbox + Stripe), pilgrims (+ traveler account links), plugin-host, preferences, rbac (capability catalogue `catalog.ts`), references, reports, social, storage (local + S3/R2, signed URLs, orphan cleanup), tenant (onboarding, KYC), transport, travelers, uploads, visa-requests. |
| `prisma/schema.prisma` | PostgreSQL multiSchema: `core`, `marketplace`, `social`, `audit`, `plugin_crm`, `plugin_booking`, `plugin_hotel`, `plugin_visa`, `plugin_transport`, `plugin_finance`, `plugin_group_ops`, `plugin_portal`, `plugin_reporting`. 12 migrations in `prisma/migrations/`. |
| `prisma/rls/runtime-role.sql` | Creates the non-superuser login the API runs as. |
| `test/` | e2e suites (`*.e2e-spec.ts`), provider suites (`test/providers/`), the Google OIDC stub (`test/support/google-oidc-stub.mjs`). |

**Security model.**
- **Roles:** 8 system roles — PILGRIM (shown as Traveler), OPERATOR_ADMIN, OPERATOR_STAFF, HOTEL_MANAGER, TRANSPORT_MANAGER, VISA_OFFICER, FINANCE_MANAGER and SUPER_ADMIN.
- **Authorization:** by capability keys of the form `namespace:resource:action`, deny by default.
- **Organizations:** Super Admin lives in a dedicated PLATFORM organization; travelers share one community organization.
- **Sessions:** 15-minute access JWTs re-checked against the database, and rotating refresh tokens in an httpOnly cookie.
- **Tenant isolation:** enforced in the service layer **and** in PostgreSQL (FORCE RLS).

### Libraries

- **Toolchain:**
  - Node.js ≥ 20 (verified on 22) and pnpm 9.12.0
  - Turborepo 2, TypeScript 5.6, Prettier 3
  - Husky, commitlint, lint-staged
- **Web:**
  - next 14.2, react 18.3, @tanstack/react-query 5, axios
  - tailwindcss 3.4 with tailwind-merge, class-variance-authority, clsx, tailwindcss-animate
  - Radix UI (dialog, dropdown-menu, popover, select, tabs, tooltip, switch, avatar, label, scroll-area, separator, slot, toast)
  - lucide-react, sonner, vaul, cmdk, framer-motion, recharts
  - react-hook-form, @hookform/resolvers, zod, date-fns, next-intl
  - next-auth (beta; present but not the auth path)
  - **@stripe/stripe-js 9.16** and **@stripe/react-stripe-js 6.10**
  - Dev: eslint 9, vitest 2.
- **API:**
  - @nestjs/* 10 (core, common, config, jwt, passport, swagger, throttler, platform-express, microservices, mapped-types)
  - **Prisma 5**, passport-jwt, bcryptjs, class-validator, class-transformer, helmet, compression, multer
  - **google-auth-library 10**, **stripe 22**, **@aws-sdk/client-s3 3** with s3-request-presigner, **nodemailer 7**
  - zod, nanoid
  - ioredis and kafkajs (present; Kafka is off by default)
  - Dev: @nestjs/cli, vitest 2 with unplugin-swc, supertest, ts-node, typescript-eslint.
- Exact versions are pinned in `pnpm-lock.yaml`.

## D. APIs and third-party services

**Application API:**
- Base path `/api/v1`. The browser always goes through the web origin at `/proxy-api/*`.
- **358 routes**, each with a declared policy. The full inventory, with the capability each route needs, is in `docs/control-tower/evidence/api-route-policies.json`.
- Health endpoints: `/api/v1/health` and `/api/v1/health/ready`. In production, readiness returns 503 if the API connects as a superuser, a BYPASSRLS role or the table owner.
- Envelope: `{ success, data }` / `{ success: false, error: { code, message, details? } }`.

| Service | Used for | State | Settings (names only) |
|---|---|---|---|
| GitHub | Code, CI, uptime workflow | Active | `gh auth login` |
| Vercel | Web hosting, `umrahconnect.io` | Active, serving old code | `API_PROXY_ORIGIN`, `PROXY_SHARED_SECRET` (project env) |
| Hostinger KVM 8 | Production API, PostgreSQL 16, Caddy | **Not provisioned** | `infrastructure/kvm/.env.production` (template `.env.production.example`) |
| Cloudflare R2 | Private documents (signed URLs), public media | **No buckets yet**; verified against MinIO | `STORAGE_DRIVER=r2`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Stripe | Card payments (Payment Element, PaymentIntents, webhooks) | **No keys yet**; verified against stripe-mock and the sandbox | `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Google Identity | "Continue with Google" (OIDC + PKCE) | **No OAuth client yet**; verified against a local stub | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| SMTP provider | Verification, reset and invitation email | **No mailbox yet**; verified with the log driver and Mailpit | `MAIL_DRIVER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| rclone → R2 | Off-site backups | **Not configured** | `OFFSITE_REMOTE` |
| Render | Legacy API host | **Retired**; service still exists; its exposed API key is still live | Decommission it; do not use it |

The production stack's other settings are in `infrastructure/kvm/.env.production.example`. Among them:
- `APP_DB_USER` / `APP_DB_PASSWORD` for the runtime role
- `PROXY_SHARED_SECRET`, `CLIENT_IP_HEADER`
- `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` for bootstrapping the first Super Admin
- `ALERT_WEBHOOK_URL`, `ORPHAN_CLEANUP_MODE`

## E. Owner actions (only the owner can do these)

| # | Action | Why |
|---|---|---|
| E1 | **Revoke the Render API key** beginning `rnd_Dsvl`: Render Dashboard → Account Settings → API Keys. Do not create a replacement. | It is in public git history and still works (checked 2026-10-01). The GitHub token from the same file is already dead. |
| E2 | Add `www.umrahconnect.io` in Vercel domains, redirecting to the apex | `www` fails TLS today |
| E3 | Provide the Hostinger KVM 8 host, SSH access, and a DNS `A` record for `api.umrahconnect.io` | Production API |
| E4 | Create Cloudflare R2 buckets (documents, public media, backups) and a scoped token | Storage and off-site backups |
| E5 | Create an SMTP mailbox with SPF, DKIM and DMARC on `umrahconnect.io` | Email |
| E6 | Create a Google OAuth Web client with redirect URI `https://umrahconnect.io/proxy-api/auth/google/callback` | "Continue with Google" |
| E7 | Create Stripe test keys and a webhook endpoint; later, activate live mode | Payments |
| E8 | Supply the approved Makkah/Kaaba hero image | Landing page |
| E9 | After the KVM cutover: switch on monitoring, then suspend and delete the Render service | Retire the legacy host |

Verification commands for each one are in `docs/control-tower/PROVIDER_ACTIVATION_CHECKLIST.md`.
Going live, in order:
1. Steps E1–E7.
2. On the server: `infrastructure/kvm/scripts/preflight.sh`, then `deploy.sh <commit>`.
3. In Vercel: set `API_PROXY_ORIGIN` and `PROXY_SHARED_SECRET`.
4. Merge `engineering/100-loop` into `main`; this deploys the web.
5. Verify, then E9.

Server runbook: `infrastructure/kvm/README.md`. Render retirement order: `docs/control-tower/RENDER_RETIREMENT.md`.

## F. Rules for every later session

- Work on `engineering/100-loop` or feature branches. Merge to `main` through a pull request, and only when a deployment is intended.
- The repository is public: never commit `.env*`, database dumps, credentials or `.project/local/`.
- Migrations and seeds run as the owner; the API runs as the runtime role.
- Every new table must be classified in `platform/api/src/prisma/rls-tables.ts`, or a test fails.
- Any flow that crosses organizations uses `withSystemScope(reason)` with a reason from the closed list.
- Gate UI with `useCapabilities()` and `lib/workspace-access.ts`, never with role names.
- Keep the approved visual system: deep green, gold and ivory, built from `components/ui/system.tsx`.
- Native mobile is out of scope until the owner says otherwise.
