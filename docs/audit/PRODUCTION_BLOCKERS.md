# Production Blockers & Findings Register

Audit date: 2026-09-17 · Commit audited: `f71a6de` (main) · Evidence: local runtime (API `:4100`, web `:3000`), live production probes, source inspection.

Every finding below was reproduced. Findings are deduplicated to root cause; the Functional Matrix and Remediation Backlog reference these IDs.

Severity: **P0** catastrophic / security / production unusable · **P1** major blocker · **P2** important broken or incomplete workflow · **P3** moderate defect / debt · **P4** polish.

## Counts

| Severity | Count |
|---|---|
| P0 | 3 |
| P1 | 9 |
| P2 | 14 |
| P3 | 10 |
| P4 | 5 |
| **Total** | **41** |

---

## P0

### AUD-001 — Production API is unreachable, so the live product cannot be used past the marketing pages
- **Subsystem:** Infrastructure (Render)
- **Symptom:** `https://umrah-connect-api.onrender.com/api/v1/health` returns no bytes (HTTP 000 after 40–120 s). `https://umrahconnect.io/proxy-api/health` and `/proxy-api/auth/login` hang 60 s. A real browser login on production stays on `/login`; the request is aborted (`net::ERR_ABORTED`) and **no error is shown to the user**.
- **Evidence:** repeated probes 2026-08-22 → 2026-09-17; TLS/HTTP2 negotiate, no response. The exact production start path (`prisma db push --accept-data-loss && node dist/src/main.js`) boots healthy locally in 2 s against an upgraded database, so a code fault is not supported by evidence.
- **Best-supported diagnosis:** Render service state (failed deploy, suspended free instance, or exhausted free hours). **Needs Render dashboard access — human-only.**
- **Affected workflows:** every authenticated workflow in production; public marketplace listings.
- **Fix dependency:** none (external). Blocks all production verification.
- **Remediation:** restore the Render service; add an external uptime monitor; move off free tier or add keep-warm; show a visible error when the API is unreachable.

### AUD-002 — Any tenant's operator admin has platform-wide Super Admin powers
- **Subsystem:** RBAC / admin module
- **Symptom:** the Pakistani tenant's operator (`admin@kaabatravel.pk`) gets **200** on `GET /admin/users` (users of all three tenants), `GET /admin/users/export` (PII CSV), `/admin/finance`, `/admin/bookings`, `/admin/audit-logs`, `/admin/stats`. The admin mutation suite (bp07) suspends, archives and reactivates *other* tenants and locks *other* tenants' users using an ordinary tenant operator account.
- **Root cause:** there is no Super Admin role. `/admin/*` is gated only by `core:tenant:*`, `core:user:*`, `core:role:manage`, and those permissions are granted to every tenant's **Operator Admin** role (39 permissions each). `AdminService` queries are not tenant-scoped by design.
- **Affected workflows:** every tenant's data confidentiality and availability.
- **Fix dependency:** AUD-004 (a real platform-admin role).
- **Remediation:** introduce a global `platform:*` permission set held only by a platform-admin role (tenant_id NULL); gate `/admin/*` on it; remove `core:tenant:update`/`core:user:*` platform semantics from tenant roles; add tests proving a tenant admin gets 403.

### AUD-003 — Hotels are not tenant-isolated (read, update, deactivate)
- **Subsystem:** Backend — `hotels.service.ts`
- **Symptom:** Kaaba's operator `PUT /hotels/{al-haramain hotel}` → **200**; the phone number changed (verified, then restored). Kaaba also reads the hotel and its rooms. Kaaba's own hotel list is correctly empty, so the defect is in by-id access.
- **Root cause:** `findOne`, `update`, `remove`, `getRoomTypes`, `createRoom` query `where: { id }` without `tenantId`; `findAll` deliberately includes `tenantId: null` shared hotels, but by-id paths never re-check ownership.
- **Remediation:** scope every by-id hotel/room/room-type query by tenant (or by shared-and-read-only); add cross-tenant tests. All other CRM entities probed return 404 cross-tenant, so this is isolated.

## P1

### AUD-004 — The seven business roles do not exist on the backend
- **Evidence:** `core.roles` contains exactly one role name, *Operator Admin* (one per tenant). All seeded users hold it; self-signups hold nothing. Every Quick Demo persona (Hotel, Transport, Visa, Finance, Super Admin, Pilgrim) logs in as `admin@alharamain.sa` and only changes a client-side `dashboardType` label (`hooks/use-auth.ts: loginAsDemo`). `inferDashboardType()` can map HOTEL/TRANSPORT/VISA/FINANCE/SUPER_ADMIN/PILGRIM roles, but no such roles are ever created.
- **Impact:** role-specific dashboards are reachable only through the demo shortcut, which is hidden in production. In production every real account sees the operator experience or nothing.
- **Remediation:** seed real roles with scoped permission sets; assign on onboarding; route by server roles.

### AUD-005 — Self-service signup produces an unusable account
- **Evidence:** `POST /auth/register` → 201, user in the community tenant with **no role**, status `PENDING_VERIFICATION`. That user gets 403 on `/social/feed`, `/social/accounts/me`, `/pilgrims`, `/finance/invoices`, `/visa-requests`, `/groups`; only marketplace listings and notifications work. The UI sends them to the operator dashboard, which fires ~15 failing 403 calls. The signup form's role choice (`roleInterest`) is informational only.
- **Remediation:** a Traveler/Pilgrim role with social + marketplace + own-bookings permissions assigned at signup; provider onboarding that creates a tenant and assigns the chosen role after KYC.

### AUD-006 — Visa documents (passport scans) are publicly downloadable
- **Evidence:** unauthenticated `GET /uploads/visa-documents/<appId>/<file>.png` → 200 from the API and via `https://<web>/uploads/...` (the Next rewrite forwards it). `main.ts` serves `uploads/` with `express.static`.
- **Mitigating factor:** file names contain 48 random bits and the application UUID, so they are not enumerable — but anyone holding a URL (logs, referrers, shared links) has permanent access.
- **Remediation:** stop serving documents statically; stream through an authenticated, tenant-checked endpoint or issue short-lived signed URLs from object storage.

### AUD-007 — No rate limiting or brute-force protection
- **Evidence:** 120 consecutive wrong-password logins → 120 × 401, zero 429, no lockout. `ThrottlerModule` is configured in `app.module.ts`, but `ThrottlerGuard` is never registered as an `APP_GUARD` (only `JwtAuthGuard` and `PermissionsGuard` are).
- **Remediation:** register `ThrottlerGuard` globally; stricter limits on `/auth/*`; progressive lockout.

### AUD-008 — Anyone can create a tenant without authenticating
- **Evidence:** unauthenticated `POST /tenants` → 201, status `PENDING_KYC`, with an arbitrary `parentTenantId` (attached itself under Al Haramain). No user is created, so the tenant is orphaned. (One such tenant, `audit-87485b`, now exists in the local database from this test.)
- **Remediation:** require authentication (or a verified onboarding flow), ignore client-supplied `parentTenantId`, add abuse limits.

### AUD-009 — Marketplace providers cannot discover requests from other tenants
- **Evidence:** Kaaba posted a HOTEL request; Al Haramain's `GET /marketplace/requests/open` (with and without `serviceType`) returned 0. The provider could still offer on it by id, and accept → convert-to-booking worked (201 ×4) with notifications.
- **Root cause:** `listOpen()` filters `where: { tenantId }` — the *provider's* tenant — so a provider only ever sees its own tenant's requests.
- **Remediation:** list open requests across tenants (filtered by provider category), excluding the provider's own.

### AUD-010 — No outbound email/SMS: password reset and verification cannot reach users
- **Evidence:** no mail/SMS library in the API. `forgotPassword()` only logs the link; the link is returned in the response only when `NODE_ENV !== 'production'`. No email-verification route exists.
- **Impact:** production users cannot reset a password or verify an email.
- **Remediation:** a mail provider behind an interface (same pattern as storage/payments); verification flow.

### AUD-011 — Uploaded files live on an ephemeral disk
- **Evidence:** `STORAGE_DRIVER` defaults to `local`; the Render container filesystem is wiped on each deploy. S3/Cloudinary drivers report missing keys and are not implemented (`storage.service.ts`). **Blocked on keys — human.**
- **Remediation:** supply keys, implement the SDK behind the existing interface, migrate.

### AUD-012 — No automated tests and no CI
- **Evidence:** 0 `*.spec.ts` / `*.test.ts(x)` files. `vitest run` exits **1** ("No test files found") in `platform/api` and `apps/web`, so `pnpm test` fails at the root. No `.github/` directory. The only verification is the ad-hoc `audit/` scripts (6 API suites, 7 browser suites — all passing), which require a running stack and seeded data.
- **Remediation:** unit + integration tests for RBAC, tenant isolation, payments, auth; CI running typecheck, build, tests and the audit suites against an ephemeral database.

## P2

| ID | Finding | Evidence | Remediation |
|---|---|---|---|
| AUD-013 | Marketplace request detail has no tenant/ownership check | `findOne(id)` unscoped; any authenticated user reads any request with all offers | Restrict to requester, offering providers, eligible providers |
| AUD-014 | Password-reset tokens are reusable | same token reset the password twice within 30 min (both 200) | single-use token (store jti / password-hash fingerprint) |
| AUD-015 | Reset link with live token is logged in production | `auth.service.ts` logs `[password-reset] email → link` regardless of environment | log only in dev; never log tokens |
| AUD-016 | Permissions referenced by routes but never defined → routes unreachable for everyone | `hotel:assignment:manage` (GET/POST `/hotels/:id/assignments` → 403), `core:sub-agent:read` (`/tenants/me/sub-agents` → 403), `core:tenant:admin` (`/tenants/:id` → 403) | define and grant, or remove routes |
| AUD-017 | Fabricated platform metrics on the landing page | `app/page.tsx` SERVICES: "1,256 Active Bookings +18%", "4.28M Applications", "12,840 Journeys Booked", "Trusted by thousands of users worldwide" | remove or source from real aggregates |
| AUD-018 | Hardcoded KPI trend deltas beside real numbers | `operations-pulse.tsx` (+12%, +8%, +18%), `finance-view.tsx` ("+18% vs last period"), `reports-view.tsx` | compute period-over-period or remove |
| AUD-019 | Authenticated web app unusable at phone width | 375 px: sidebar stays open (~245 px), content clipped (screenshot) | collapsible/off-canvas sidebar below `md` |
| AUD-020 | `www.umrahconnect.io` fails TLS | DNS resolves to Vercel; certificate CN=`umrahconnect.io`, no SAN for www | add `www` domain in Vercel (redirect to apex) — human |
| AUD-021 | Mobile app not production-ready | `tsc` 2 errors (TS2580 `process`); fallback API URL is a dead `trycloudflare.com` tunnel; alerts tab shows fabricated sample notifications; not launched in this audit | fix types, require `EXPO_PUBLIC_API_URL`, remove sample data |
| AUD-022 | No live payment gateway | `StripeProvider` methods throw "not enabled"; 503 names missing keys — **blocked on Stripe keys** | implement once keys are supplied |
| AUD-023 | Production login fails silently when the API is unreachable | browser stays on `/login` with no message after 45 s | timeout + user-facing error |
| AUD-024 | No role-based UI route guards | roleless user opens `/admin-*` pages (shells render; data calls 403) | guard routes by server permissions |
| AUD-041 | Documented Row-Level Security does not exist | ADR-001 names PostgreSQL RLS as the isolation mechanism; `pg_class.relrowsecurity` is false on **every** table; `setTenantContext()` is attached to the request but never invoked. Isolation depends solely on per-query `where: { tenantId }` — the gap that produced AUD-003 | enable RLS policies and call the context setter inside a transaction, or amend the ADR and add isolation tests |
| AUD-026 | Lint is not configured | no ESLint config anywhere; api `eslint` exit 2; `next lint` opens an interactive setup prompt | add configs; wire into CI |

## P3

| ID | Finding | Evidence |
|---|---|---|
| AUD-025 | Locking a user or force-logout leaves issued access tokens valid up to 15 min | locked user's existing token → 200; login → 401 |
| AUD-027 | "All systems live" badge is static | `operations-pulse.tsx:116`; shown while production API is down |
| AUD-028 | Seed data internally inconsistent | booking UC-2026-00001 "0 pilgrims" · SAR 42,500; pilgrim BOOKED with 0 linked bookings; hotel with 0 rooms |
| AUD-030 | `robots.txt`, `sitemap.xml`, `favicon.ico` return 404 in production | live probe |
| AUD-032 | Upload type validation is extension-only | `storage.service.ts` / `uploads.controller.ts` check extension, not content |
| AUD-033 | Plugin install/disable only requires a JWT | `plugin-host.controller.ts` has no `@RequirePermissions` |
| AUD-034 | No realtime transport; "real-time notification engine" claim | no WebSocket/SSE; notifications poll every 15–30 s |
| AUD-035 | CORS allows any `*.vercel.app` / `*.trycloudflare.com` origin with credentials, and `render.yaml` sets `CORS_ORIGINS="*"` | `main.ts`; impact limited — API reads bearer headers, not cookies. Production value **not confirmed** (dashboard) |
| AUD-036 | `render.yaml` sets `WEB_URL=http://localhost:3000` | production reset links would point at localhost (value in dashboard **not confirmed**) |
| AUD-038 | No background jobs | no scheduler/queue: invoices never auto-become OVERDUE, no expiry reminders |

## P4

| ID | Finding |
|---|---|
| AUD-029 | Anonymous page loads fire API calls that 401 before the client redirect (45 routes) |
| AUD-031 | `next.config` image domains reference `umrahconnects.io` (with s), not `umrahconnect.io` |
| AUD-037 | Many declared env vars/integrations unused (root `.env.example`); Kafka/Redis wired but disabled |
| AUD-039 | Payment settle and invoice reconcile are separate queries, not one transaction |
| AUD-040 | `origin/develop` is 9 commits behind `main` with no unique work |

## Explicitly not defects

- Regulator integrations (Nusuk, SISKOPATUH, NAHCON) are **not implemented** and are **honestly labelled PLANNED** in the UI.
- Swagger is disabled when `NODE_ENV=production`.
- Tenant isolation holds for pilgrims, bookings, invoices, payments, vehicles, visa applications, visa requests, packages and groups (cross-tenant by-id → 404, cross-tenant write → 404).
- The demo tab is correctly hidden on the production host.
