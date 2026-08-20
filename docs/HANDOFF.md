# Umrah Connect — Complete Project Handoff

> Purpose: let a fresh machine (and a fresh Claude Code session) pick this
> project up with zero prior context. Read fully before changing code.
> Last updated: 2026-07-24, commit `9b6d12e` on `main`.

---

## 1. What this is

Umrah Connect is a production-deployed, multi-tenant, role-based platform for
the Umrah ecosystem. Seven roles: **Pilgrim, Umrah Operator/Agency, Hotel,
Transport Company, Visa Agency, Finance Manager, Super Admin**. Each tenant has
a private CRM workspace; Marketplace, Social Hub, Connections, Groups,
Requests/Offers, and Messaging are shared cross-role areas.

Brand name is exactly **“Umrah Connect”** in all public copy (never “Umrah
Connects” — only the repo slug keeps the s).

## 2. Architecture

- **Monorepo:** pnpm 9.12 + turbo. Node ≥ 20.
- **`apps/web`** — Next.js 14 App Router. TanStack Query for data; axios client
  at `apps/web/lib/api.ts` pointing at **`/proxy-api`** (a `next.config`
  rewrite to the API) so web+API are same-origin on any host — do not replace
  with absolute URLs.
- **`platform/api`** — NestJS 10 + Prisma 5.22 + PostgreSQL, **13-schema
  multiSchema** Prisma setup (`schema.prisma` is the single source of truth for
  enums/models). No migrations directory — **`prisma db push`** workflow.
- **Auth:** JWT (15-min access + 7-day refresh) in localStorage. A **coalesced
  refresh singleton** in `lib/api.ts` is shared with
  `components/providers/auth-provider.tsx` — never add a second refresh path.
  Login is **email-first**: `POST /auth/login {email, password}`; `tenantId`
  optional, only for disambiguating an email present in multiple tenants
  (server returns `TENANT_REQUIRED` + tenant list in that case).
- **Statuses:** web reads all enum/status metadata from
  `apps/web/lib/statuses.ts` (mirrors prisma enums). Extend there, not inline.
- **Money:** stored as BigInt cents (`*Cents` columns). UI amounts in SAR are
  converted `SAR → cents` at the service layer.

## 3. Live infrastructure & deploy pipeline

| Thing | Value |
|---|---|
| GitHub | `https://github.com/sabilahmad77/umrahconnects` (public) — `main` = production |
| Web | Vercel → **https://umrahconnect.io** (note: `www.` has **no DNS record** yet — needs a CNAME, human/DNS access) |
| API | Render → **https://umrah-connect-api.onrender.com/api/v1** (service `srv-d94peplckfvc73adlr9g`) |
| DB (prod) | Render Postgres `dpg-d94o1dtckfvc73abpon0-a` |
| Deploy | push `main` → both auto-deploy. Gate every push on `next build` + `nest build` passing locally. |
| Cold start | Render free tier sleeps; first request after idle ≈ 50 s. The web client retries transient 5xx (query-provider) so it self-heals. |

**Production secrets are NOT in this repo.** They live in the Vercel and Render
dashboards (owner: the user). Local dev needs only the committed
`.env.example` templates.

**Tenant IDs (demo tenant “Al Haramain”):** local `ac08f9b4-aaec-4474-b61b-4832c5a5ec4c`,
production `17664941-bb92-40b7-a814-218b88e52a7a` (IDs differ because seeds ran
separately; discover them via `GET /tenants/slug/al-haramain-ksa` if needed).

## 4. Accounts

Seeded by `platform/api/prisma/seed.ts` (password `Admin@1234` for all):

- `admin@alharamain.sa` — operator/tenant admin, demo tenant (KSA)
- `admin@baitussalam.co.id` — Indonesian operator tenant
- `admin@kaabatravel.pk` — Pakistani operator tenant

Login page: real email+password sign-in. On **localhost/preview only**, a
“Quick Demo Access” tab gives one-click role logins (operator, hotel,
transport, visa, finance, super admin, pilgrim personas). It is **hidden on
production hosts** via `isDemoAllowed()` in `app/(auth)/login/page.tsx` —
keep it that way.

## 5. State of work — what is DONE and verified

Everything below was verified with evidence (HTTP codes, reload-persistence,
browser proof) and is logged in **`IMPLEMENTATION_LOG.md`** (read it — it is
the authoritative history). Verification scripts live in **`audit/`**.

- **FIX-01…FIX-09** (first hardening loop): signup role allow-list (no
  self-service admin), coalesced token refresh (no login bounces), 5xx retry,
  pilgrim status enums aligned DB↔API↔UI, dead links/buttons removed, counter
  consistency, manual payment recording with cumulative status
  (PARTIALLY_PAID/PAID + overpay→400), packages module, marketplace
  request→offer→accept→booking loop.
- **BP-02 supply depth:** hotels/room-types/rooms, transport
  vehicles/drivers/routes/assignments/bookings (bookings endpoint is an
  assignment-shaped alias), visa checklist + reject-with-reason. Real 5xx
  defects fixed (numeric `floor` coercion; `findFirst({id: undefined})` trap in
  hotel booking). Seeds: `audit/bp02_supply.py` (idempotent, run against local
  or prod).
- **BP-03 edit persistence:** proven via real browser events + hard reload;
  `updatePackage` silent-drop fixed.
- **BP-04 honest labels:** regulator integrations (Nusuk/SISKOPATUH) shown as
  **PLANNED**, never “live”. Do not fabricate integration status.
- **BP-05 social depth:** follow route exposed (was dead code), likes survive
  reload (feed returns viewer reactions), comments, group post/note/poll
  counters, marketplace discovery. `audit/bp05_social.py` + `bp05_browser.js`.
- **Phase 5 a11y:** global `:focus-visible` ring, `role="dialog"` on all 22
  modals, AA contrast sweep, signup inline-on-blur validation, guided empty
  states.
- **Phase 6:** deployed + live-verified; 20 per-role screenshots in
  `audit/screens/`.
- **Recovery (second execution) started:** real **email-first login** fixed
  (was demanding an unknowable tenant UUID — root cause demo-only usability);
  demo auth gated off production. Committed `9b6d12e`, deployed.

## 6. State of work — what REMAINS (the active roadmap)

From the user's “second execution prompt” (full text lives in the chat
history; the actionable scope is captured here). Work one verified vertical at
a time; never mark done without end-to-end proof.

1. **Visa Document Management (confirmed failure A)** — real upload/download/
   preview/replace/version/status(MISSING→RECEIVED→VERIFIED/REJECTED+reason)/
   expiry/audit/notifications. Metadata layer exists
   (`compliance` module, JSON checklist on visaApplication). **BLOCKED for
   binary persistence:** needs Cloudinary or S3 keys from the user (uploads
   currently hit ephemeral disk via `uploads` module — unacceptable for prod).
2. **Visa Service Requests (B)** — full ticket workflow: category, priority,
   assignee, due date, internal notes vs public response, timeline,
   escalate/close/reopen, detail page, notifications, audit. Only a minimal
   `submissions` endpoint exists today. Not blocked — build it.
3. **Finance Payments (C)** — provider abstraction + sandbox provider:
   payment intent, states (PENDING→AUTHORIZED→PAID/PARTIALLY_PAID/FAILED/
   REFUNDED…), transaction records, webhook + signature + idempotency, refunds.
   Manual payment recording works today; **real gateway needs sandbox keys
   (Stripe test keys preferred)** from the user.
4. **Super Admin — Tenants (D) & Users (E)** — endpoints exist
   (`admin.controller.ts`: tenants list/detail/status/delete; users
   list/status/roles/force-logout). Complete the management UI: search/filter,
   suspend/reactivate with confirmations, role assignment, revoke sessions,
   export, audit records. Not blocked.
5. Then: KYC lifecycle with backend enforcement, category-specific marketplace
   listing forms, cross-account social/notification proof (two real accounts),
   mobile parity + Expo/APK builds, CI workflows, `/docs/recovery/*` ledger.

**Standing user decisions:** payments gateway deferred until user supplies
keys; keep demo login for local testing only; “optional” per audit docs =
do it properly anyway; deploy = push `main` (pre-authorized).

**Known human-blocked items:** Cloudinary/S3 keys, payment sandbox keys,
regulator API credentials, real social/store URLs, `www` CNAME, paid Render
plan (or keep-warm) for cold starts.

## 7. Conventions, gotchas, and the working loop

- **Verification loop (non-negotiable):** reproduce → smallest vertical fix →
  API proof (status codes + re-fetch persistence) → browser proof (real
  clicks, hard reload) → red-team (bad/missing/unauth input must 4xx, never
  5xx) → log to `IMPLEMENTATION_LOG.md` + `STATUS.md` → commit. Never fake
  success; never claim “working” from a page merely loading.
- **Audit scripts:** run from `audit/` — Python (`requests`) for API proofs,
  `playwright-core` + system Chrome
  (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) for browser
  proofs. Pattern: login via demo tile locally / real creds; scripts accept
  `API_URL TENANT_ID` argv for prod runs.
- **Prisma traps seen in this codebase:** `findFirst({where:{id: undefined}})`
  matches the *first row* — always guard required ids with a 400. String
  columns (`floor`, `roomNumber`) 500 on numeric input — coerce with
  `String()`. Throw Nest exceptions, never bare `Error` (bare = 500).
- **DTO whitelist:** the API uses forbidNonWhitelisted validation in places —
  e.g. driver create takes `firstName/lastName`, **not** `name`.
- **Local stack:** Postgres 15 via Homebrew (`/usr/local/opt/postgresql@15`;
  if it won't start, delete a stale `postmaster.pid` whose PID isn't a
  postmaster). API logs → `/tmp/api.log`, web → `/tmp/web.log`; readiness =
  `running on port` / HTTP 200 on `:3000`.
- **Never verify write-fixes against production** except the pre-authorized
  demo-tenant seeds/proofs; prefer local for all destructive testing.

## 8. Quick health checklist for a new machine

```bash
curl -s http://localhost:4000/api/v1/health            # → 200 JSON
curl -s -o /dev/null -w '%{http_code}' localhost:3000  # → 200
# real login (no tenantId!):
curl -s -X POST localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@alharamain.sa","password":"Admin@1234"}' | head -c 120
cd audit && python3 bp02_supply.py && python3 bp05_social.py   # 24/24 + 23/23
```
