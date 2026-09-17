# Umrah Connect Current-State Audit

| | |
|---|---|
| Audit date | 2026-09-17 |
| Commit audited | `f71a6de` on `main` (clean tree, in sync with `origin/main`) |
| Local stack | API `http://localhost:4100/api/v1`, web `http://localhost:3000`, PostgreSQL 15 `127.0.0.1:5433` |
| Production | `https://umrahconnect.io` (Vercel) · `https://umrah-connect-api.onrender.com/api/v1` (Render) |
| Companion files | `FUNCTIONAL_MATRIX.md` · `ROUTE_AND_ROLE_MATRIX.md` · `API_AUDIT.md` · `LOCAL_VS_PRODUCTION.md` · `PRODUCTION_BLOCKERS.md` · `REMEDIATION_BACKLOG.md` |

## 1. Executive Summary

Umrah Connect is a substantial, genuinely working **single-role operator platform**. Locally, the full stack boots in seconds; 304 API
routes are served with no 5xx on any read path tested; every one of 65 static web routes and 12 detail routes renders live database data
with zero page errors, console errors or failed API calls for an operator; and all 13 existing verification suites pass (6 API suites,
245 checks; 7 browser suites, 118 checks). CRM, bookings, packages, groups, hotels, transport, visa applications, a visa ticketing system,
versioned visa documents, invoicing with a sandbox payment gateway, marketplace, social feed, connections and cross-tenant messaging all
work end to end on the local stack.

It is **not production-ready**, for three reasons that are each sufficient on their own:

1. **The live product does not work past its marketing pages.** The production frontend is current and healthy, but the production API
   has not responded since 2026-08-22, so login silently fails. This is an infrastructure problem (Render), not a code fault.
2. **The role model promised by the product does not exist on the backend.** There is exactly one role, *Operator Admin*. Hotel,
   Transport, Visa, Finance, Super Admin and Pilgrim are client-side labels over the same account, reachable only via a demo shortcut that
   is hidden in production. Self-signup produces an account with no permissions at all.
3. **There are three P0 security defects.** Any tenant's operator holds platform-wide Super Admin powers (read and export every tenant's
   users, suspend other tenants); hotels are readable and writable across tenants; and the Row-Level Security described in the
   architecture decision record was never enabled.

Beyond those: passport scans are publicly downloadable by URL, login has no rate limiting, anyone can create a tenant without
authenticating, marketplace providers cannot discover other tenants' requests, no email can be sent, uploads live on an ephemeral disk,
and there are no automated tests or CI.

## 2. Audit Scope

**Executed**
- Repository forensics: structure, manifests, 73 Prisma models, 32 enums, 304 routes, 79 web routes, 23 mobile screens, docs, ADRs.
- Git state; debt markers; secret-bearing files.
- Typecheck (api, web, mobile), lint (api, web), test runners (api, web), production builds (api, web).
- Full local boot and health checks (API, web, proxy, database).
- RBAC model read directly from the database; permission catalogue diffed against every `@RequirePermissions`.
- API: parsed inventory cross-checked against the live route map; GET sweep of all 85 parameterless routes as operator and anonymous;
  detail routes with real, random and malformed ids; cross-tenant read/write probes; platform-admin probes as a tenant operator;
  roleless-user probes; brute-force probe; upload exposure; CORS and header checks.
- Browser: three-identity sweep (anonymous, operator, roleless) of 65 static routes; 12 detail routes; phone-width layout check with
  screenshot; all 7 existing browser suites.
- Cross-account flows between two real tenants: connection request/accept, messaging, marketplace request → offer → accept → booking.
- Auth flows: signup, login, password reset (including token reuse), locked-user enforcement.
- Mock/static detection across web and mobile source.
- Production: DNS, TLS (apex and `www`), redirects, headers, metadata, 9 routes in a real browser, a real login attempt, build freshness,
  API and proxy reachability.

**Not executed / blocked**
- Any authenticated production workflow — BLOCKED by AUD-001.
- Production database and environment values — BLOCKED (dashboard access).
- Mobile app runtime (simulator/Expo) — not launched; assessed by typecheck and source only.
- Destructive or load testing — out of scope by design.

**Temporary runtime adjustments (no file changes)**
- API run with `PORT=4100`, web with `API_PROXY_ORIGIN=http://localhost:4100`: port 4000 is held on this machine by a Colima (Docker VM)
  port-forward for an unrelated container. Both variables are already supported by the code.

**Changes made to the repository**
- `audit/sweep_routes_2026.js` — new three-identity route sweep (audit tooling).
- `audit/bp07_admin.py` — fixture selection limited to seeded operator tenants. It previously picked "any other tenant", which broke once
  the audit created a user-less tenant; a first attempt at the fix mistakenly selected the community tenant, which produced a false
  failure that was diagnosed from the error text ("Invalid credentials", not "Tenant is not active") before being corrected.
- `docs/audit/*` — this report set.
- No product code was changed.

**Local data created by the audit** (local database only): tenant `audit-87485b` (via the unauthenticated endpoint); self-signup users
`audit.*`, `sweep.*`, `reset.*`, `reset2.*` @example.com; an accepted connection and a conversation between the Al Haramain and Kaaba
operators; one marketplace request/offer/booking; records created by the verification suites. A hotel phone number changed during the
AUD-003 probe was restored and re-verified.

## 3. Repository & Architecture

| Layer | Evidence-based finding |
|---|---|
| Monorepo | pnpm 9.12.0 workspaces + Turborepo; Node ≥ 20 |
| Web | Next.js 14.2 App Router, React 18.3, Tailwind 3.4, TanStack Query 5; axios via same-origin `/proxy-api` rewrite |
| API | NestJS 10, class-validator DTOs, helmet, global `JwtAuthGuard` + `PermissionsGuard`, `TenantContextMiddleware` |
| Database | PostgreSQL 15, Prisma 5.22, **13 schemas**, 73 models, 205 indexes, 64 foreign keys; schema-push workflow (no migrations directory) |
| Auth | Email + password (bcrypt), JWT access 15 min + refresh 7 days, refresh tokens persisted; bearer header only |
| Authorization | DB-driven permission catalogue (39 permissions), role→permission joins; single role in practice |
| Multi-tenancy | Application-level `tenantId` filters; **RLS documented but not enabled** (AUD-041) |
| Storage | `StorageService` seam; `local` driver active; S3/Cloudinary unimplemented |
| Payments | `PaymentProvider` seam; sandbox gateway complete; Stripe unimplemented |
| Events | Kafka client present, disabled |
| Realtime | none (15–30 s polling) |
| Email/SMS | none |
| Jobs | none |
| Mobile | Expo 54 / React Native 0.81, 23 screens, axios to the same API |
| Hosting | Vercel (web), Render Docker free tier (API), managed Postgres |
| CI/CD | none; deploy = push `main` |

**Domain entities (from `schema.prisma`)** — core: Tenant, TenantKyc, User, RefreshToken, OtpCode, Role, Permission, RolePermission,
UserRole, TenantPlugin, PublicInquiry · CRM: Pilgrim, FamilyGroup, PilgrimDocument · booking: Package, Booking, BookingPilgrim · hotel:
Hotel, RoomType, Room, HotelBooking, Allotment, RoomAssignment · transport: Vehicle, Driver, VehicleDriver, TransportRoute,
TransportAssignment, TasreehPermit · visa: VisaApplication, RegulatorySubmission, VisaServiceRequest (+Note, +Event), VisaDocument
(+Version) · finance: Invoice, Payment, PaymentTransaction, PaymentWebhookEvent, BudgetPlan, LedgerEntry, FxRate · group ops: TripGroup,
GroupMember, GroupInvite, GroupPost, GroupPostComment, GroupPoll, GroupPollVote, GroupNote, GroupDocument, Incident · marketplace: Vendor,
Listing, ListingInquiry, ListingBooking, Quote, VendorRating, MarketplaceRequest, RequestOffer · social: SocialAccount, Post, Comment,
Reaction, Follow, SavedPost, PostReport, Connection, Conversation, Message, Notification · audit: AuditLog.

Models with no observed API surface: `FamilyGroup`, `LedgerEntry`, `FxRate`, `Quote`, `VendorRating`, `TasreehPermit`,
`RegulatorySubmission` beyond create/list, `PostReport`, `OtpCode`.

## 4. Runtime Status

| Component | Status | Evidence |
|---|---|---|
| PostgreSQL 15 | ✅ running | `pg_isready` 127.0.0.1:5433 |
| API | ✅ running | `/health` 200, `db: connected`; 304 routes mapped; boot < 5 s; no errors in log |
| Web | ✅ running | `/login` 200; proxy `/proxy-api/health` 200 |
| Workers / queues / websockets | n/a | none exist |
| Mobile dev server | ⚪ not started | outside what was needed to classify it (§13) |
| API typecheck | ✅ exit 0 | `tsc --noEmit` |
| Web typecheck | ✅ exit 0 | `tsc --noEmit` |
| Mobile typecheck | ❌ exit 2 | 2 × TS2580 (`process` without `@types/node`) |
| API build | ✅ exit 0 | `nest build` → `dist/src/main.js` |
| Web build | ✅ exit 0 | `next build`, 83 routes |
| API lint | ❌ exit 2 | no ESLint config exists |
| Web lint | ❌ interactive | `next lint` opens a setup prompt |
| API tests | ❌ exit 1 | "No test files found" |
| Web tests | ❌ exit 1 | "No test files found" |

## 5. Frontend Status

- 79 routes (65 static, 14 dynamic). All 44 sidebar links resolve.
- **Operator:** 65/65 static routes 200, 0 page errors, 0 console errors, 0 failed API calls; 12/12 dynamic routes render live records.
- **Anonymous:** 45 protected routes redirect to `/login`; each fires a few 401 calls first (AUD-029).
- **Roleless user:** never redirected; operator layout full of 403s (AUD-005); `/admin-*` shells render (AUD-024).
- Authenticated pages are API-driven; hardcoded arrays are tab/nav definitions or tiles computed from API data.
- **Mocked on live pages:** trend deltas on dashboard, finance, reports (AUD-018); "All systems live" badge (AUD-027).
- **Static marketing:** 18 pages; the landing page shows fabricated platform metrics (AUD-017).
- Accessibility: focus ring, dialog roles, AA contrast and on-blur validation verified by `p5_a11y` (7/7); confirmation/reason dialogs are
  `role="dialog"`; no native `confirm`/`prompt` in the admin, visa or payments flows.
- **Phone width:** unusable in the authenticated app (AUD-019).
- Detail-level data oddities from seeds (AUD-028).

## 6. Backend Status

- Organised as feature modules with controller/service separation, DTO validation (`ValidationPipe`), Nest exceptions, a global error
  envelope, helmet security headers and audit logging on newer modules.
- No 5xx observed on any GET, on any detail route with bogus or malformed ids, or in 245 suite checks (including extensive red-team
  input).
- **Authorization gaps:** AUD-002 (admin scope), AUD-003 (hotels), AUD-013 (marketplace request detail), AUD-016 (3 orphan
  permissions), AUD-033 (plugin host).
- **Unauthenticated write:** AUD-008 (`POST /tenants`).
- **Throttling configured but not enforced:** AUD-007.
- **Disconnected code:** `setTenantContext()` (never called), Kafka events (disabled), Stripe/S3/Cloudinary adapters (stubs), several
  models without endpoints (§3).
- Transactions: payment capture and invoice reconciliation are not atomic (AUD-039).
- Logging: the password-reset link with its token is logged in every environment (AUD-015).

## 7. Database Status

- Schema is valid and pushes cleanly; a fresh database reconstructs completely from `schema.prisma` + three seeds.
- No drift found: every model the code queries exists; enum values used by the web (`lib/statuses.ts`) match the Prisma enums for all
  verified domains (pilgrim, invoice, tenant, user, visa request, visa document).
- 205 indexes and 64 foreign keys present.
- **RLS: not enabled on any table** despite ADR-001 (AUD-041).
- Local data: 5 tenants, 9 users, 15 pilgrims, 3 bookings, 5 hotels, 12 invoices, 9 listings, 14 posts (includes audit-created records).
- Persistence across hard reloads verified for pilgrims, bookings, hotels, transport, visa requests, visa documents, admin actions,
  payments, likes and follows (browser suites).

## 8. Authentication Status

| Capability | Status |
|---|---|
| Email-first login | ✅ verified (API and browser); production ❌ (AUD-001) |
| Wrong password | ✅ 401 "Invalid credentials"; short password → 400 (DTO) |
| Brute-force protection | ❌ none (AUD-007) |
| Signup | ⚠️ 201, but account is unusable (AUD-005) |
| Token refresh | ✅ coalesced singleton; sessions survive hard reloads in every browser suite |
| Logout | ✅ refresh token revoked |
| Password reset | ⚠️ works locally via returned dev link; no mail delivery (AUD-010); token reusable (AUD-014); token logged (AUD-015) |
| Email verification | ❌ not implemented; users remain `PENDING_VERIFICATION` |
| Locked user | ✅ login refused; ⚠️ existing access token valid ≤ 15 min (AUD-025) |
| Suspended tenant | ✅ every request refused ("Tenant is not active"); reactivation restores access |
| Token storage | access token in cookie + localStorage (readable by JS), refresh token in localStorage; API reads bearer header only |
| Demo login | local/preview only; hidden in production ✅; all personas share one account |

## 9. RBAC / Roles Status

See `ROUTE_AND_ROLE_MATRIX.md` for the full table. In short:

| Role | Backend role | Actual condition |
|---|---|---|
| Operator / Agency | ✅ *Operator Admin* | Fully functional locally; **over-privileged** — holds platform admin (AUD-002) |
| Hotel | ❌ | UI label via demo shortcut only |
| Transport | ❌ | UI label via demo shortcut only |
| Visa | ❌ | UI label via demo shortcut only |
| Finance | ❌ | UI label via demo shortcut only |
| Super Admin | ❌ | UI label only; its API is reachable by every operator |
| Pilgrim / Traveler | ❌ | Self-signup gets no role; broken |

Permission catalogue: 39 defined, 33 distinct values referenced by routes, **3 referenced but undefined** (AUD-016). 39 routes are JWT-only.

## 10. API Status

304 routes (132 GET, 92 POST, 51 PUT, 3 PATCH, 26 DELETE); 19 public. Read paths are robust (no 5xx). Six suites pass 245/245.
Isolation holds for every tenant entity probed except hotels. Full inventory with per-route gating in `API_AUDIT.md`.

## 11. Functional User Journeys

| Journey | Result |
|---|---|
| Public landing → pricing/resources | PASS (local and production) |
| Signup → first use | **FAIL** — roleless account (AUD-005) |
| Login → operator dashboard → hard reload | PASS locally; **FAIL** in production (AUD-001) |
| Password recovery | PARTIAL — works only with the dev link |
| Operator: pilgrim → package → booking | PASS (suites + detail pages) |
| Operator: hotel → room types → rooms → hotel booking → occupancy | PASS (bp02) — but cross-tenant writable (AUD-003) |
| Operator: hotel room assignment | **FAIL** — 403 for everyone (AUD-016) |
| Operator: vehicles, drivers, routes, assignments, transport bookings | PASS (bp02) |
| Visa: application → checklist → reject with reason | PASS (bp02) |
| Visa: service ticket lifecycle | PASS (bp06, 51 + 29) |
| Visa: document upload → verify → replace → reject → expiry | PASS (bp08, 46 + 19) — files public, disk ephemeral |
| Finance: invoice → manual payment → reconciliation | PASS (FIX-06, invoice detail) |
| Finance: sandbox intent → capture → refund → webhook | PASS (bp09, 46 + 13) |
| Finance: live card payment | BLOCKED (Stripe keys) |
| Marketplace: browse listings | PASS locally |
| Marketplace: request → provider discovers it | **FAIL** (AUD-009) |
| Marketplace: offer → accept → convert to booking (two tenants) | PASS |
| Social: post, like, comment, follow, group posts/notes/polls | PASS (bp05, 23 + 7) |
| Social: connection request → accept (two tenants) | PASS, with notifications |
| Social: direct message (two tenants) | PASS |
| Traveler social experience | **FAIL** (AUD-005) |
| Super Admin: tenants & users | PASS functionally (bp07, 55 + 34) — but **available to any operator** (AUD-002) |
| Super Admin: KYC review | UNVERIFIED end to end |
| Hotel / Transport / Visa / Finance role journeys | **Not possible with a real account** (AUD-004) |

## 12. External Integrations

| Integration | Code state | Config | Runtime | Blocking |
|---|---|---|---|---|
| Vercel (web hosting) | n/a | dashboard | ✅ serving current build | — |
| Render (API hosting) | Dockerfile + blueprint | dashboard | ❌ not responding | **Yes** (AUD-001) |
| Managed Postgres | `DATABASE_URL` | dashboard (`sync: false`) | unverifiable | — |
| Object storage (S3 / Cloudinary) | interface + unimplemented drivers | `STORAGE_DRIVER`, `S3_*`, `CLOUDINARY_*` unset | local disk only | **Yes** for production files (AUD-011) |
| Payments — sandbox | complete | defaults | ✅ | — |
| Payments — Stripe | stub adapter | `STRIPE_*` unset | 503 naming missing keys | Yes for real payments |
| Email / SMS / WhatsApp | none | many names in root `.env.example`, none read | — | **Yes** (AUD-010) |
| Regulators (Nusuk, SISKOPATUH, NAHCON) | none | names only | honestly labelled PLANNED | Product scope |
| ZATCA e-invoicing | columns only | names only | — | KSA compliance |
| Kafka | client present | `KAFKA_ENABLED=false` | disabled | — |
| Redis | `REDIS_URL` declared | — | unused | — |
| Monitoring (Sentry, Datadog, OTEL) | none | names only | — | Production observability |
| AI services | none present | — | — | Out of scope |

## 13. Mobile Status

Expo 54 / React Native 0.81, 23 screens under `apps/mobile/app`, 15 of which call the API through hooks. Not launched in this audit.
- `tsc --noEmit` fails with 2 errors (TS2580).
- Default API URL is a dead `trycloudflare.com` quick tunnel unless `EXPO_PUBLIC_API_URL` is supplied at build time.
- The Alerts tab renders six fabricated notifications (e.g. "Payment of SAR 2,450 was received") whenever the backend has none — MOCK.
- `eas.json` exists; bundle ids `com.umrahconnects.mobile`.
- Against production it cannot function while AUD-001 persists.
Classification: **PARTIAL / not production-ready.**

## 14. Production Deployment Status

- **Frontend:** live on Vercel, HTTP 200, HSTS, `http→https` 308, serving the **current** build (latest routes and UI strings present).
- **Backend:** Render service not responding since 2026-08-22 (AUD-001). Artifact from the same commit boots locally.
- **Domain:** apex OK; `www` resolves but has no matching certificate (AUD-020); `robots.txt`, `sitemap.xml`, favicon 404 (AUD-030).
- **Deploy mechanism:** push `main` → both auto-deploy. No CI gate, no health-gated rollout, no monitoring, no documented rollback.
- **Declared production config worth checking:** `CORS_ORIGINS="*"`, `WEB_URL=http://localhost:3000` (AUD-035, AUD-036).
- Nothing was deployed during this audit.

## 15. Local vs Production Differences

The frontend is at parity. Every production failure traces to the unreachable API; there is no evidence of stale code. Details in
`LOCAL_VS_PRODUCTION.md`.

## 16. Security Findings

| ID | Sev | Finding |
|---|---|---|
| AUD-002 | P0 | Tenant operators hold platform admin (read/export all users, suspend other tenants) |
| AUD-003 | P0 | Hotels readable/writable across tenants |
| AUD-006 | P1 | Passport/visa document files public by URL |
| AUD-007 | P1 | No rate limiting / lockout |
| AUD-008 | P1 | Unauthenticated tenant creation with arbitrary parent |
| AUD-041 | P2 | RLS documented but absent |
| AUD-013 | P2 | Marketplace request detail unscoped |
| AUD-014 | P2 | Reusable password-reset tokens |
| AUD-015 | P2 | Reset tokens written to production logs |
| AUD-025 | P3 | Access tokens survive lock/force-logout for ≤ 15 min |
| AUD-032 | P3 | Extension-only upload validation |
| AUD-033 | P3 | Plugin install/disable only JWT-gated |
| AUD-035 | P3 | Permissive CORS allowances |

**Checked and clean:** no secrets committed (only `.example` templates tracked); no client-side secret leakage observed; Swagger off in
production; helmet headers (CSP, HSTS, nosniff, frame options) on the API; Vercel headers on the web; cross-tenant isolation for nine core
entity types; reset tokens cannot be used as access tokens (strategy requires tenant, issuer and audience); no account enumeration via
forgot-password; demo login hidden in production; wrong-password and validation errors return 4xx.

## 17. Testing Status

| Kind | Present | Run | Result |
|---|---|---|---|
| Unit tests | **0 files** | vitest (api, web) | **exit 1** — no test files |
| Integration tests | 0 | — | — |
| E2E (Playwright project) | none configured | — | — |
| Audit API suites (`audit/*.py`) | 6 | all | **245 / 245 pass** |
| Audit browser suites (`audit/*.js`) | 7 | all | **118 / 118 pass** |
| Mobile tests | 0 | — | — |
| CI | none | — | — |

Totals for runnable suites: **363 checks, 363 pass, 0 fail, 0 skipped**; unit/integration: **unrunnable (none exist)**.

The audit suites are strong on workflows and input red-teaming, but they require a running seeded stack, are not in CI, and were
written against the single-role model — bp07 exercises Super Admin actions with a tenant operator and passes *because* of AUD-002.
A green run is not evidence of production readiness.

## 18. Mocked / Static / Incomplete Areas

| Item | UI | Backend | DB | Real integration | Status |
|---|---|---|---|---|---|
| Landing metrics (1,256 bookings, 4.28M applications, 12,840 journeys, "trusted by thousands") | ✅ | ❌ | ❌ | ❌ | **MOCK** |
| KPI trend deltas (+12%, +8%, +18%) on dashboard, finance, reports | ✅ | ❌ | ❌ | ❌ | **MOCK** |
| "All systems live" badge | ✅ | ❌ (no health query) | ❌ | ❌ | **MOCK** |
| Mobile Alerts sample notifications | ✅ | fallback only | ❌ | ❌ | **MOCK** |
| Hotel / Transport / Visa / Finance / Super Admin / Pilgrim roles | ✅ dashboards | ❌ roles | ❌ | n/a | **UI-ONLY** |
| Integrations page "real-time notification engine" | ✅ | polling only | ✅ | ❌ | PARTIAL |
| Stripe gateway | ✅ | stub | ✅ | ❌ | BLOCKED |
| S3 / Cloudinary storage | ✅ banner | stub | ✅ | ❌ | BLOCKED |
| Email / SMS | ❌ | ❌ | ❌ | ❌ | MISSING |
| Email verification | ❌ | ❌ | field | ❌ | MISSING |
| Realtime | ❌ | ❌ | n/a | ❌ | MISSING |
| Background jobs | n/a | ❌ | n/a | n/a | MISSING |
| Regulator integrations | ✅ labelled PLANNED | ❌ | partial | ❌ | MISSING (honest) |
| ZATCA | ❌ | ❌ | columns | ❌ | MISSING |
| API docs page | ✅ "COMING SOON" | Swagger (dev) | n/a | n/a | PARTIAL (honest) |
| Hotel room assignments | ✅ | ✅ (unreachable) | ✅ | n/a | FAIL (AUD-016) |

No simulated success responses, dummy accounts beyond the documented seeds, fake notifications on the web, or buttons without handlers
were found on authenticated web screens.

## 19. Production Blockers

**P0 (3):** AUD-001 production API down · AUD-002 tenant operators have platform admin · AUD-003 hotel cross-tenant access.

**P1 (9):** AUD-004 no real roles · AUD-005 signup unusable · AUD-006 public document files · AUD-007 no rate limiting · AUD-008
unauthenticated tenant creation · AUD-009 marketplace discovery broken · AUD-010 no email · AUD-011 ephemeral storage · AUD-012 no tests or CI.

Full register with evidence: `PRODUCTION_BLOCKERS.md` (41 findings).

## 20. Technical Debt

- Isolation relies on hand-written tenant filters; RLS never enabled (AUD-041).
- No lint, no unit tests, no CI (AUD-012, AUD-026).
- Inconsistent response envelopes across three controllers.
- Unused models and integrations; aspirational root `.env.example` (AUD-037).
- Non-atomic payment reconciliation (AUD-039); no job runner (AUD-038).
- Seed data inconsistencies (AUD-028).
- Stale `develop` branch (AUD-040); wrong image domain in `next.config` (AUD-031).
- Environment coupling: API default port 4000 collides with common local tooling.

## 21. Recommended Remediation Order

1. **A-1** restore the production API (human, dashboard) — unblocks every production verification.
2. **B-1** real role model → **A-2** platform admin separation → **A-3 / A-3b** tenant isolation fixes. These are the security core.
3. **A-5** rate limiting, **A-6** close public tenant creation, **A-4** protect documents.
4. **B-2** working traveler signup, **D-1 / D-2** marketplace discovery and access.
5. **A-7 / H-1 / H-2 / H-3** tests, lint and CI, so the above cannot regress.
6. **F-1 / F-2 / F-3** remove fabricated figures, fix phone layout, surface API errors.
7. **G-1 / G-3 / G-2** storage, mail, Stripe as keys arrive.
8. **E-x** role-specific scopes; **I-x** production configuration, `www`, monitoring, deploy gate.

## 22. Final Current-State Verdict

| | |
|---|---|
| **Production-ready** | **NO** |
| **Local full-stack runnable** | **YES** — API, web and database boot and serve all routes; 363/363 suite checks pass |
| **Frontend completeness** | 79 routes, all rendering live data for an operator; mocked KPI deltas and status badge; landing page fabricates metrics; unusable at phone width; role dashboards exist but are reachable only through a demo label |
| **Backend completeness** | 304 routes, robust on reads and invalid input; operator domains, visa ticketing and documents, sandbox payments, marketplace transactions, social and messaging implemented; email, realtime, jobs, live gateway and durable storage missing |
| **Database readiness** | Schema valid and reproducible, indexed and constrained; no RLS despite the ADR; seed data inconsistent in places |
| **Authentication readiness** | Login, refresh and logout work; no brute-force protection, no email delivery, no email verification, reusable reset tokens |
| **RBAC readiness** | **Not ready** — one role exists; that role holds platform-admin powers; hotels leak across tenants; self-signup has no permissions |
| **Functional matrix** | 73 capabilities: 25 verified pass (34%), 17 partial, 11 fail, 4 mock, 8 missing, 3 blocked, 5 unverified |
| **Critical blockers (P0)** | **3** |
| **Major blockers (P1)** | **9** |
