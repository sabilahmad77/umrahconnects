# Umrah Connect — new Mac handoff

Everything needed to continue on a fresh Mac with a fresh Claude Code. Read this
first; the one-shot prompt at the end does the setup.

| | |
|---|---|
| Repository | **https://github.com/sabilahmad77/umrahconnects** (public) |
| Branch to clone | **`engineering/100-loop`** — the complete, verified codebase |
| Do not use | `main` and `develop` (old code; `main` is what production currently runs) |
| Handoff written | 2026-10-01, at commit `c58d48a` plus this file |

```bash
git clone --branch engineering/100-loop https://github.com/sabilahmad77/umrahconnects.git umrah-connects
```

---

## 1. Where things are

| Thing | Where | Notes |
|---|---|---|
| **Code** | GitHub, branch `engineering/100-loop` | 200 commits newer than `main`. Also pushed as history labels: `integration/web-final`, `claude/core-finalization`, `codex/web-frontend-finalization` (all already contained in `engineering/100-loop`). |
| **Domain / web hosting** | Vercel, `umrahconnect.io` | Auto-deploys from `main` only. Still serving the **old** code, whose API is the dead Render service. |
| **API hosting (target)** | Hostinger KVM 8 | Fully prepared in `infrastructure/kvm/`, **not provisioned or deployed yet**. |
| **API hosting (legacy)** | Render service `umrah-connect-api` | Retired from the target, still exists, unresponsive. To be decommissioned after cutover. |
| **Production database** | **None exists.** | The Render account holds no PostgreSQL (checked through the Render API on 2026-09-18). There is no production data to migrate. |
| **Development data** | Local PostgreSQL on the old Mac | Development and QA data only, recreated on the new Mac by the seeds (§6). Nothing irreplaceable. |
| **Secrets** | Nowhere in the repository | Every `.env*` file is gitignored. Local development secrets are generated fresh (§6). No Google, Stripe, R2 or SMTP credentials exist yet. |

### What stays the same on the new Mac

- The GitHub account and repository (sign in again with `gh auth login`).
- The Vercel project and the domain. The Vercel MCP connection can be re-authorized when needed.
- The open owner actions in §9. They are not tied to a machine.

### What is deliberately left behind on the old Mac, and why that is fine

| Left behind | Why it does not matter |
|---|---|
| `platform/api/.env`, `apps/web/.env*.local` | Local development secrets only. Regenerate them (§6). |
| Local PostgreSQL databases | Development/QA data. The seeds rebuild it, including 15 QA accounts with new random passwords. |
| `.project/local/qa-credentials.json` | Rebuilt by `seed-qa-identities.ts` with new passwords. |
| `.claude/settings.local.json` (all copies) | **Do not copy them.** They contain the exposed Render API key, which is still live — revoke it (§9.1). |
| Extra git worktrees (`umrah-connects-eng100/*`, core, integration, Codex) | Every one of their commits is in `engineering/100-loop`. The Codex worktree's uncommitted files were ported in commit `48693e5` (verified file-by-file). |
| Docker images and containers | None are needed; the test stand-ins are pulled on demand. |

If you want to keep the old Mac's development database anyway (for example records you
typed in through the UI), dump it to a file and copy that file across yourself. **Never
commit it** — the repository is public.

```bash
pg_dump -h 127.0.0.1 -p 5433 -Fc umrah_connects_integration > ~/Desktop/umrah-dev.dump
```

---

## 2. Current state (2026-10-01)

**Verdict: ENGINEERING COMPLETE — LAUNCH BLOCKED.**

| Measure | Value |
|---|---|
| Engineering acceptance | **155 / 155 = 100.0** |
| Ready-to-launch | **155 / 169 = 91.7** — the 14 open rows are all owner actions (§9) |
| Historical requirements | 117 / 131 (the 14 remaining are the same external obligations) |
| Mandatory gates | G2–G7 PASS · G1 FAIL (the exposed Render key is still live) · G8 BLOCKED (no provider credentials or server yet) |
| API e2e | 522 passed, 0 skipped, 0 failed — run as a non-superuser database role so row-level security is enforced |
| Browser QA | 87/87 routes, 3,329 checks, 3,262 passed, actual Chrome, 18 identities |
| Accessibility | axe WCAG 2.2 AA: 0 violations; a real Orca screen-reader session |
| Defects | 40 fixed in the last loop; 3 open, all minor (P3) |

The full record is in `docs/control-tower/`. Start with `ENGINEERING_100_FINAL_REPORT.md`,
then `PROVIDER_ACTIVATION_CHECKLIST.md`.

---

## 3. Repository layout

pnpm workspace + Turborepo monorepo.

```
apps/web/            Next.js 14 frontend (App Router)
apps/mobile/         Expo app — NOT at parity, out of scope for now
platform/api/        NestJS 10 API + Prisma 5 (PostgreSQL)
infrastructure/kvm/  Production stack for Hostinger KVM 8 (Compose, Caddy, PostgreSQL 16, scripts, systemd units)
infrastructure/docker/  Local dev-stack helpers
plugins/             Plugin packages (plugin host in the API)
audit/               QA harnesses: acceptance QA (Python), browser scripts, register tooling (audit/eng100/)
docs/control-tower/  Engineering record: register, scorecards, decisions, blockers, evidence
docs/ui-ux/          Design system, design decisions, route inventory, UI evidence
docs/adr/            Architecture decision records
.github/workflows/   api-ci.yml, infra-ci.yml, uptime.yml
```

### Frontend layout — `apps/web`

| Path | What lives there |
|---|---|
| `app/` | Routes (87 page templates). Public marketing pages at the root (`/`, `/solutions`, `/pricing`, `/about`, `/marketplace-preview`, `/resources/[slug]`, …); auth in `app/(auth)/` (`/login`, `/reset-password`) plus `/signup`, `/verify-email`, `/auth/callback`; the signed-in workspace in `app/(dashboard)/` (traveler, operator, hotel, transport, visa, finance and Super Admin areas, `/settings`, `/onboarding`, `/notifications`, …). |
| `components/ui/system.tsx` | The design system: Button, Input, Select, Dialog, Alert, Card, PageHeader, FileUpload, LoadingState, QueryFailure, Tooltip… Build new screens from these. |
| `components/layout/` | Workspace shell, sidebar, header, notification bell, email-verification banner. |
| `components/<domain>/` | One folder per area: admin, auth, bookings, compliance, connections, dashboard, discover, finance, groups, hotels, marketplace, messages, my-bookings, my-offers, notifications, onboarding, packages, pilgrims, profile, providers, public, reports, requests, settings, social, transport, travel-plan, travelers. |
| `hooks/` | TanStack Query hooks per domain; `use-capabilities.ts` (all UI permission checks). |
| `lib/api.ts` | Axios client to `/proxy-api` (same origin), silent refresh through the httpOnly cookie, single-flight writes, `Idempotency-Key` on creates. |
| `lib/workspace-access.ts` | The one route→capability table: navigation, route guards and landing pages. Never authorize by role name. |
| `lib/session.ts`, `lib/auth.ts` | Profile from `GET /auth/me` (roles, capabilities, verification state). |
| `middleware.ts` | Adds the proxy secret and the real client IP to `/proxy-api/*` requests. |
| `next.config.mjs` | `/proxy-api/*` → `API_PROXY_ORIGIN/api/v1/*`; production build **fails** without `API_PROXY_ORIGIN` (by design). |
| `tailwind.config.ts`, `app/globals.css` | Brand palette (deep green `brand`, `gold`, `ivory`, `navy`, `midnight`) and component classes. |
| `public/` | Logos and favicons. The approved hero image is expected at `public/images/hero/makkah-approved.webp` (not supplied yet). |
| `tests/` | Vitest: contracts against the server DTOs and enums, capabilities, checkout state machine, accessibility semantics, … |

### Backend architecture — `platform/api`

| Path | What lives there |
|---|---|
| `src/main.ts`, `src/bootstrap/` | App bootstrap, environment validation (refuses unsafe production config, including any Render URL), client-IP trust, Swagger (`/api/docs`, development only). |
| `src/common/` | Guards (JWT, capabilities, throttling), decorators (`@Public`, `@RequirePermissions`, `@AnyAuthenticated`, `@PublicWithOptionalUser`), the error filter, audit and **idempotency** interceptors, tenant-scope helpers. Every route must declare a policy or the API refuses to boot. |
| `src/prisma/` | PrismaService plus **row-level security**: `db-context.ts` (request scope: tenant / platform / system), `rls-extension.ts`, `rls-tables.ts` (every table classified). Crossing organizations needs `withSystemScope(reason)` from a closed list. |
| `src/modules/` | 31 modules: admin, audit, auth (password, Google OIDC, verification, sessions), bookings, compliance (visa cases), connections, events, finance, groups, health, hotels, inquiries, mail, marketplace, marketplace-requests, notifications, payments (sandbox + Stripe), pilgrims (+ traveler account links), plugin-host, preferences, rbac (capability catalogue in `catalog.ts`), references (per-organization sequences), reports, social, storage (local + S3/R2, signed URLs, orphan cleanup), tenant (onboarding, KYC), transport, travelers, uploads, visa-requests. |
| `prisma/schema.prisma` | PostgreSQL multiSchema: `core`, `marketplace`, `social`, `audit`, `plugin_crm`, `plugin_booking`, `plugin_hotel`, `plugin_visa`, `plugin_transport`, `plugin_finance`, `plugin_group_ops`, `plugin_portal`, `plugin_reporting`. |
| `prisma/migrations/` | 12 migrations, applied with `prisma migrate deploy` (never `db push`). |
| `prisma/rls/runtime-role.sql` | Creates the non-superuser login the API must run as. |
| `prisma/seed*.ts`, `prisma/scripts/` | Seeds, `sync-rbac`, demo and QA identities, `bootstrap-platform-admin`, route-policy export. |
| `test/` | e2e suites (`*.e2e-spec.ts`), provider integration suites (`test/providers/`), the Google OIDC stub (`test/support/google-oidc-stub.mjs`). |

Security model in one paragraph: 8 system roles (PILGRIM shown as Traveler, OPERATOR_ADMIN,
OPERATOR_STAFF, HOTEL_MANAGER, TRANSPORT_MANAGER, VISA_OFFICER, FINANCE_MANAGER, SUPER_ADMIN);
authorization by capability keys (`namespace:resource:action`), deny by default; Super Admin
lives in a dedicated PLATFORM organization; travelers share one community organization;
15-minute access JWTs re-validated against the database, rotating refresh tokens in an
httpOnly cookie; tenant isolation in the service layer **and** in PostgreSQL (FORCE RLS).

The decisions behind all of this are in `docs/control-tower/DECISIONS.md` (D-001 … D-025).

---

## 4. Libraries

**Toolchain:** Node.js ≥ 20 (verified on 22.23), pnpm 9.12.0 (`packageManager`), Turborepo 2,
TypeScript 5.6, Prettier 3, Husky, commitlint, lint-staged.

**Web (`apps/web`):** next 14.2, react 18.3, @tanstack/react-query 5, axios 1.7, tailwindcss 3.4
(+ tailwindcss-animate, tailwind-merge, class-variance-authority, clsx), Radix UI primitives
(dialog, dropdown-menu, popover, select, tabs, tooltip, switch, avatar, label, scroll-area,
separator, slot, toast), lucide-react, sonner, vaul, cmdk, framer-motion, recharts,
react-hook-form + @hookform/resolvers + zod, date-fns, next-intl, next-auth (beta, present but
not the auth path), **@stripe/stripe-js 9.16 + @stripe/react-stripe-js 6.10**. Dev: eslint 9,
vitest 2.

**API (`platform/api`):** @nestjs/* 10 (core, common, config, jwt, passport, swagger, throttler,
platform-express, microservices, mapped-types), **@prisma/client 5 + prisma 5**, passport +
passport-jwt, bcryptjs, class-validator, class-transformer, helmet, compression, multer,
**google-auth-library 10**, **stripe 22**, **@aws-sdk/client-s3 + s3-request-presigner 3**,
**nodemailer 7**, zod, nanoid, ioredis and kafkajs (present, Kafka disabled by default). Dev:
@nestjs/cli, vitest 2 + unplugin-swc, supertest, ts-node, typescript-eslint.

Exact versions are pinned in `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` reproduces them.

---

## 5. APIs

### The application API

- Base path `/api/v1`; the browser always calls it through the web origin at `/proxy-api/*`.
- **358 routes**, each with a declared policy. Full inventory with the capability each route
  requires: `docs/control-tower/evidence/api-route-policies.json`.
- Swagger UI in development: `http://localhost:4000/api/docs`.
- Health: `/api/v1/health` (liveness) and `/api/v1/health/ready` (readiness; in production it
  returns 503 if the API connects as a superuser, a BYPASSRLS role or the table owner).
- Response envelope: `{ success: true, data }` / `{ success: false, error: { code, message, details? } }`.

### Third-party services

| Service | Used for | State | Settings (names only) |
|---|---|---|---|
| GitHub | Code, CI (Actions), uptime workflow | Active | `gh auth login` |
| Vercel | Web hosting, domain `umrahconnect.io` | Active, old code | `API_PROXY_ORIGIN`, `PROXY_SHARED_SECRET` in the Vercel project |
| Hostinger KVM 8 | Production API + PostgreSQL 16 + Caddy | **Not provisioned** | `infrastructure/kvm/.env.production` |
| Cloudflare R2 | Private documents (signed URLs) and public media | **No account/buckets yet**; verified against MinIO | `STORAGE_DRIVER=r2`, `S3_*` |
| Stripe | Card payments (Payment Element, PaymentIntents, webhooks) | **No keys yet**; verified against stripe-mock and the sandbox | `PAYMENT_PROVIDER`, `STRIPE_*` |
| Google Identity | "Continue with Google" (OIDC code flow + PKCE) | **No OAuth client yet**; verified against a local stub | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| SMTP provider | Verification, reset and invitation email | **No mailbox yet**; verified with the log driver and Mailpit | `MAIL_DRIVER`, `SMTP_*`, `MAIL_FROM` |
| rclone → R2 | Off-site backups | **Not configured** | `OFFSITE_REMOTE` |
| Render | Legacy API host | **Retired from the target**; service still exists; its API key is exposed and live | — (decommission, do not use) |

Local stand-ins for tests (Docker, optional): `stripe/stripe-mock`, `minio/minio`, `axllent/mailpit`
— commands in `docs/control-tower/LOCAL_TEST_GUIDE.md`.

---

## 6. Local setup on the new Mac

### Prerequisites

```bash
xcode-select --install                      # if not already installed
brew install node@22 postgresql@15 gh
brew services start postgresql@15
corepack enable && corepack prepare pnpm@9.12.0 --activate
gh auth login                               # GitHub account sabilahmad77
# Optional: Docker Desktop or colima (provider test stand-ins); Google Chrome (browser QA scripts)
```

### Databases and the runtime role

The API must run as a **non-superuser** role, or row-level security is silently bypassed.
Migrations and seeds run as the owner (your macOS user, a superuser in Homebrew's PostgreSQL).

```bash
createdb umrah_connects_dev
createdb umrah_connects_test                # e2e suite; resets it on every run (name must end in _test)
```

### Environment files (generate fresh secrets; never commit them)

`platform/api/.env`:

```bash
NODE_ENV=development
PORT=4000
MIGRATE_DATABASE_URL=postgresql://<your-mac-user>@127.0.0.1:5432/umrah_connects_dev?schema=public
DATABASE_URL=postgresql://uc_app:<runtime-password>@127.0.0.1:5432/umrah_connects_dev?schema=public
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
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

The templates with comments are `platform/api/.env.example`, `apps/web/.env.local.example`
and, for production, `infrastructure/kvm/.env.production.example`. `PROXY_SHARED_SECRET` and
`CLIENT_IP_HEADER` are optional locally (set the same secret in both API and web if used).

### Install, migrate, create the runtime role, seed

```bash
pnpm install --frozen-lockfile
cd platform/api
npx prisma generate
DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
UC_RUNTIME_LOGIN=uc_app UC_RUNTIME_PASSWORD='<runtime-password>' \
  psql "postgresql://$(whoami)@127.0.0.1:5432/umrah_connects_dev" -v ON_ERROR_STOP=1 -f prisma/rls/runtime-role.sql
export DATABASE_URL="$MIGRATE_DATABASE_URL"        # seeds run as the owner
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-modules.ts
npx ts-node prisma/seed-marketplace.ts
npx ts-node prisma/scripts/sync-rbac.ts
npx ts-node prisma/scripts/seed-demo-roles.ts      # one account per role, password Admin@1234 (dev only)
npx ts-node prisma/scripts/seed-isolation-pairs.ts # a second organization per type
npx ts-node prisma/scripts/seed-qa-identities.ts   # 15 QA accounts, random passwords → .project/local/qa-credentials.json (0600)
unset DATABASE_URL
```

(The runtime-role script prints the role's flags; superuser, bypass and owner must all be `f`.)

### Run

```bash
pnpm --filter @umrah-connects/api dev     # API → http://localhost:4000/api/v1/health
pnpm --filter @umrah-connects/web dev     # Web → http://localhost:3000
```

Sign in at http://localhost:3000/login, for example `admin@alharamain.sa` / `Admin@1234`
(operator), `traveler@umrahconnect.dev`, `hotel@makkahgrand.dev`, `superadmin@umrahconnect.dev`
(all `Admin@1234`, development only), or any QA account from `.project/local/qa-credentials.json`.

### Quality gate

```bash
cd platform/api
npx tsc --noEmit && pnpm lint && npx vitest run
npx vitest run --config vitest.e2e.config.ts           # uses umrah_connects_test, as the runtime role
# provider suite (needs the three Docker stand-ins; see LOCAL_TEST_GUIDE.md):
pnpm test:providers
cd ../../apps/web
npx tsc --noEmit && npx eslint app components hooks lib middleware.ts && npx vitest run
NODE_ENV=production API_PROXY_ORIGIN=http://localhost:4000 npx next build
```

Expected: API unit 201, e2e 522 (5 of them need `STRIPE_MOCK_URL`, otherwise skipped),
web 255, both builds succeed.

---

## 7. Working rules for the next sessions

- **Never push to `main` without deciding to deploy.** Vercel deploys `main` to
  `umrahconnect.io` automatically. Work on `engineering/100-loop` or feature branches and
  merge through a pull request when a deployment is intended.
- The repository is **public**: never commit `.env*`, dumps, credentials or `.project/local/`.
- Run migrations and seeds as the owner; run the API as the runtime role.
- Any new table must be classified in `platform/api/src/prisma/rls-tables.ts` (a test fails otherwise).
- Any flow that crosses organizations must use `withSystemScope(reason)` with a reason from the closed list.
- Gate UI with `useCapabilities()` and `lib/workspace-access.ts`, never with role names.
- Native mobile is out of scope until the owner says otherwise.

---

## 8. Production plan (when you decide to launch)

1. Revoke the Render key (§9.1). 2. Provision the KVM 8 host and DNS. 3. Create R2, SMTP,
Google and Stripe test credentials. 4. `infrastructure/kvm/scripts/preflight.sh`, then
`deploy.sh <commit>` (backup → one-off migrate as owner → runtime role → start → readiness).
5. Set `API_PROXY_ORIGIN=https://api.umrahconnect.io` and `PROXY_SHARED_SECRET` in Vercel.
6. Merge `engineering/100-loop` into `main` (this deploys the web). 7. Verify, enable
monitoring, then decommission Render. Every step with its check is in
`docs/control-tower/PROVIDER_ACTIVATION_CHECKLIST.md`; the server runbook is
`infrastructure/kvm/README.md`; the Render order is `docs/control-tower/RENDER_RETIREMENT.md`.

---

## 9. Owner action list (things only you can do)

| # | Action | Why |
|---|---|---|
| 1 | **Revoke the Render API key** beginning `rnd_Dsvl` — Render Dashboard → Account Settings → API Keys. Do not create a replacement. | It is in public git history and still works (checked 2026-10-01). The GitHub token from the same file is already dead. |
| 2 | Add `www.umrahconnect.io` in Vercel domains (redirect to the apex) | `www` currently fails TLS |
| 3 | Provide the Hostinger KVM 8 host, SSH access and a DNS `A` record `api.umrahconnect.io` | Production API |
| 4 | Create Cloudflare R2 buckets (private documents, public media, backups) and a scoped token | Document/media storage and off-site backups |
| 5 | Create an SMTP mailbox with SPF, DKIM and DMARC on `umrahconnect.io` | Verification, reset and invitation email |
| 6 | Create a Google OAuth Web client; redirect URI `https://umrahconnect.io/proxy-api/auth/google/callback` | "Continue with Google" |
| 7 | Create Stripe test keys and a webhook endpoint; later activate live mode | Card payments |
| 8 | Supply the approved Makkah/Kaaba hero image (`apps/web/public/images/hero/makkah-approved.webp`) | Landing-page hero |
| 9 | After the KVM cutover: switch on monitoring, then suspend and delete the Render service | Retire the legacy host |

Exact commands to verify each one: `docs/control-tower/PROVIDER_ACTIVATION_CHECKLIST.md`.

---

## 10. One-shot prompt for the new Claude Code

Paste everything inside the box into Claude Code on the new Mac.

```text
Set up the Umrah Connect project on this Mac from GitHub and get it running on localhost.

1. Clone exactly this repository and branch (do not use main or develop):
   git clone --branch engineering/100-loop https://github.com/sabilahmad77/umrahconnects.git ~/Projects/umrah-connects
   Then read ~/Projects/umrah-connects/NEW_MAC_HANDOFF.md completely before doing anything else.
   It is the source of truth for the architecture, libraries, APIs, environment variables and
   rules. Also skim docs/control-tower/ENGINEERING_100_FINAL_REPORT.md.

2. Check and install the prerequisites listed in section 6 of the handoff (Xcode command-line
   tools, Homebrew node@22, postgresql@15 started as a service, pnpm 9.12.0 via corepack,
   gh). Ask me before installing anything that needs my password or a paid account. If
   GitHub CLI is not signed in, tell me to run `gh auth login` myself.

3. Create the databases umrah_connects_dev and umrah_connects_test, and the three local env
   files exactly as section 6 shows. Generate every secret fresh with `openssl rand -hex 32`
   (JWT secrets, the runtime-role password). Never print secrets in your replies and never
   commit any .env file — the repository is public.

4. Run `pnpm install --frozen-lockfile`, `prisma generate`, the migrations as the owner,
   the runtime-role script, and all the seeds in the order given (as the owner). Confirm the
   runtime role prints f|f|f for superuser/bypass/owner.

5. Start the API (port 4000) and the web app (port 3000). Verify:
   - http://localhost:4000/api/v1/health returns ok,
   - http://localhost:3000/login loads,
   - signing in through the real form as admin@alharamain.sa / Admin@1234 lands on /dashboard,
   - the API process is connected to PostgreSQL as uc_app (not the superuser).

6. Run the quality gate from section 6 (API typecheck, lint, unit, the full e2e suite; web
   typecheck, lint, tests; the production web build with API_PROXY_ORIGIN set). Expected
   numbers are in the handoff. Report any difference with the exact output.

7. Rules for this and every later session: work on engineering/100-loop or feature branches;
   do NOT push to main (it auto-deploys umrahconnect.io on Vercel) unless I explicitly decide
   to deploy; do not deploy anywhere, change DNS, or touch Render; native mobile is out of
   scope. The owner-only actions are listed in section 9 — remind me about item 1 (revoking
   the exposed Render key) if it is still open.

When finished, give me: the local URLs, the commands to start and stop the stack, the test
results, and anything that needed my action.
```
