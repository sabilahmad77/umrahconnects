# Remediation Backlog

> **Render references here are RETIRED (2026-09-19).** Render (`umrah-connect-api.onrender.com`, `render.yaml`) is retired
> from the target architecture (API → Hostinger KVM 8). This historical record is kept unchanged as evidence; current
> state and the remaining owner steps: `docs/control-tower/RENDER_RETIREMENT.md`.

Derived only from confirmed findings in `PRODUCTION_BLOCKERS.md` (AUD-xxx). **Not implemented in the audit session.**
Order within each phase respects dependencies. Every task ends with an executable acceptance check.

---

## PHASE A — P0/P1 system blockers

### A-1 · Restore the production API — P0
- **Problem:** AUD-001. Render API returns nothing; production login impossible.
- **Evidence:** 120 s timeouts on `/api/v1/health` and `/proxy-api/*`; artifact boots locally in 2 s.
- **Desired:** production API healthy and reachable through `umrahconnect.io/proxy-api`.
- **Area:** Render service `srv-d94peplckfvc73adlr9g` (dashboard), `render.yaml`, `Dockerfile`.
- **Dependencies:** human dashboard access.
- **Acceptance:** `curl https://umrahconnect.io/proxy-api/health` → 200 with `db: connected` in < 5 s warm; real browser login on production reaches `/dashboard`.

### A-2 · Separate platform administration from tenant administration — P0
- **Problem:** AUD-002.
- **Evidence:** Kaaba operator → 200 on `/admin/users`, `/admin/users/export`, `/admin/finance`; bp07 performs cross-tenant suspends with a tenant account.
- **Desired:** only a platform-admin identity can call `/admin/*`.
- **Area:** `platform/api/src/modules/admin/admin.controller.ts`, `rbac.service.ts` (permission catalogue), `prisma/seed-modules.ts`, a new platform-admin seed, `audit/bp07_*`.
- **Dependencies:** B-1.
- **Acceptance:** tenant operator → 403 on every `/admin/*` route; platform admin → 200; bp07 rewritten to run as platform admin and to assert the 403s.

### A-3 · Tenant-scope hotels, rooms and room types — P0
- **Problem:** AUD-003.
- **Evidence:** cross-tenant `PUT /hotels/:id` → 200 and changed data.
- **Desired:** by-id hotel access limited to the owning tenant (shared `tenantId: null` hotels read-only).
- **Area:** `hotels.service.ts` (`findOne`, `update`, `remove`, `getRoomTypes`, `getRooms`, `createRoom`, `updateRoom`, room types, allotments).
- **Dependencies:** none.
- **Acceptance:** cross-tenant GET/PUT/DELETE on hotel, room, room type → 404; bp02 still 24/24; new cross-tenant test added.

### A-3b · Defence-in-depth for tenant isolation — P2
- **Problem:** AUD-041. ADR-001 promises RLS; none is enabled and the context setter is never called.
- **Area:** `prisma.service.ts setTenantContext`, `tenant-context.middleware.ts`, SQL policies per tenant table, `docs/adr/001-multi-tenancy-rls.md`.
- **Dependencies:** A-3.
- **Acceptance:** either RLS is enabled with policies and a raw query without tenant context returns no foreign rows, or the ADR is amended and an automated cross-tenant test covers every tenant-owned model.

### A-4 · Protect stored documents — P1
- **Problem:** AUD-006.
- **Desired:** document files are never served without an authenticated, tenant-checked request.
- **Area:** `main.ts` (`express.static('/uploads')`), `apps/web/next.config.mjs` `/uploads` rewrite, `visa-documents.service.ts`, a download endpoint or signed URLs.
- **Dependencies:** G-1 if moving to object storage at the same time.
- **Acceptance:** unauthenticated GET of a document URL → 401/403/404; owning tenant downloads succeed; other tenant → 404.

### A-5 · Enforce rate limiting — P1
- **Problem:** AUD-007.
- **Area:** `app.module.ts` — register `ThrottlerGuard` as `APP_GUARD`; tighter `@Throttle` on `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`.
- **Acceptance:** 30 rapid bad logins → at least one 429; normal browsing suites still pass.

### A-6 · Close unauthenticated tenant creation — P1
- **Problem:** AUD-008.
- **Area:** `tenant.controller.ts` `POST /tenants`, `CreateTenantDto`.
- **Acceptance:** anonymous `POST /tenants` → 401; `parentTenantId` from the client is ignored; onboarding still creates tenants through an authenticated path.

### A-7 · Establish automated tests and CI — P1
- **Problem:** AUD-012.
- **Area:** `platform/api` and `apps/web` vitest setup, `.github/workflows/ci.yml`.
- **Acceptance:** `pnpm test` exits 0 with real tests covering A-2, A-3, A-5, B-2, auth, payments; CI runs typecheck, both builds and tests on every push.

---

## PHASE B — Auth + RBAC

### B-1 · Create the real role model — P1
- **Problem:** AUD-004.
- **Desired:** seeded roles `Platform Admin` (global), `Operator Admin`, `Hotel Manager`, `Transport Manager`, `Visa Officer`, `Finance Manager`, `Traveler`, each with a scoped permission set.
- **Area:** `prisma/seed.ts`, `seed-modules.ts`, `rbac.service.ts` catalogue, `apps/web/lib/auth.ts` (`inferDashboardType` already maps these names).
- **Acceptance:** a real login for each role lands on its dashboard **without** the demo shortcut; each role's out-of-scope endpoints → 403.

### B-2 · Make self-signup produce a working traveler — P1
- **Problem:** AUD-005.
- **Area:** `auth.service.ts register`, community tenant role assignment, signup page, post-login routing.
- **Dependencies:** B-1.
- **Acceptance:** a new signup reaches a traveler home, reads and posts to the social feed, browses the marketplace and creates a request; 0 failing API calls on its landing page.

### B-3 · Rebuild demo personas on real accounts — P2
- **Problem:** AUD-004 (demo shortcut masks the missing roles).
- **Area:** `hooks/use-auth.ts loginAsDemo`, seeds.
- **Dependencies:** B-1.
- **Acceptance:** each demo tile signs in as a distinct seeded user whose server roles match the persona.

### B-4 · Define or remove orphan permissions — P2
- **Problem:** AUD-016.
- **Area:** `hotel:assignment:manage`, `core:sub-agent:read`, `core:tenant:admin`.
- **Acceptance:** a startup check fails if any `@RequirePermissions` value is missing from the catalogue; room assignments reachable for hotel managers.

### B-5 · Harden password reset and email verification — P1/P2
- **Problem:** AUD-010, AUD-014, AUD-015.
- **Dependencies:** G-3 (mailer).
- **Acceptance:** reset token single-use (second use → 401); no token in logs in any environment; verification email marks `emailVerifiedAt` and activates the account.

### B-6 · Role-based UI route guards — P3
- **Problem:** AUD-024.
- **Acceptance:** a user without the required permission is redirected away from `/admin-*` and role dashboards.

### B-7 · Immediate session revocation on lock/force-logout — P3
- **Problem:** AUD-025.
- **Acceptance:** after `LOCKED` or force-logout, the user's existing access token → 401 on the next request.

---

## PHASE C — Core backend/API

### C-1 · Plugin host permissions — P3 (AUD-033)
Acceptance: install/disable require an admin permission; roleless → 403.

### C-2 · Upload content validation — P3 (AUD-032)
Acceptance: a renamed non-image/non-PDF is rejected by content inspection.

### C-3 · Transactional payment settlement — P4 (AUD-039)
Acceptance: capture + invoice reconciliation run in one Prisma transaction.

### C-4 · Background jobs — P3 (AUD-038)
Acceptance: invoices past `dueAt` become `OVERDUE` automatically; document/visa expiry reminders are generated.

### C-5 · Consistent response envelope — P4
Acceptance: connections, marketplace-requests and notifications return `{success, data}` like every other controller, with clients updated.

---

## PHASE D — Core product workflows

### D-1 · Cross-tenant marketplace discovery — P1 (AUD-009)
Acceptance: provider A sees tenant B's open request filtered by its category, never its own; offer → accept → booking still passes.

### D-2 · Marketplace request access control — P2 (AUD-013)
Acceptance: a user who is neither requester nor eligible provider → 404 on `/marketplace/requests/:id`.

### D-3 · Seed data consistency — P3 (AUD-028)
Acceptance: seeded bookings have pilgrims, totals match packages, BOOKED pilgrims have bookings, hotels have rooms.

---

## PHASE E — Role-specific modules

### E-1 · Hotel manager scope — depends on B-1, A-3
Acceptance: a hotel manager sees only their property's rooms, allotments, assignments and bookings.

### E-2 · Transport manager scope — depends on B-1
### E-3 · Visa officer scope — depends on B-1 (assignee list should list visa officers only)
### E-4 · Finance manager scope — depends on B-1
### E-5 · KYC enforcement end-to-end — P2
Acceptance: a `PENDING_KYC` tenant cannot use the platform (already enforced by the tenant middleware), submits KYC, is approved by a platform admin, becomes `ACTIVE`; proven with a real new tenant.

### E-6 · ZATCA e-invoicing — P2 (KSA compliance; fields exist, no code)

---

## PHASE F — Frontend / UX completion

### F-1 · Remove fabricated and hardcoded figures — P2 (AUD-017, AUD-018, AUD-027)
Acceptance: no hardcoded metric, delta or status string remains; deltas computed from data or removed; status badge reflects `/health`.

### F-2 · Mobile-width layout — P2 (AUD-019)
Acceptance: at 375 px the sidebar is off-canvas; key screens have no clipped content.

### F-3 · Visible error when the API is unreachable — P2 (AUD-023)
Acceptance: with the API stopped, login shows a clear error within 15 s.

### F-4 · Avoid pre-redirect API calls for anonymous users — P4 (AUD-029)

### F-5 · Marketing honesty pass — P3 (AUD-034)
Acceptance: Integrations page does not claim real-time delivery unless implemented.

### F-6 · Housekeeping — P4 (AUD-030, AUD-031)
Acceptance: `robots.txt`, `sitemap.xml`, favicon served; image domain corrected.

### F-7 · Mobile app — P2 (AUD-021)
Acceptance: `tsc` clean; build fails without `EXPO_PUBLIC_API_URL`; sample notifications removed; app runs against the restored production API.

---

## PHASE G — Integrations

### G-1 · Durable object storage — P1 (AUD-011) — **blocked on Cloudinary or S3 keys**
Acceptance: `STORAGE_DRIVER=s3|cloudinary` stores and retrieves a document; files survive a redeploy.

### G-2 · Stripe gateway — P2 (AUD-022) — **blocked on Stripe test keys**
Acceptance: `PAYMENT_PROVIDER=stripe` passes an adapted bp09 against Stripe test mode, including signed webhooks.

### G-3 · Mail provider — P1 (AUD-010) — **blocked on SMTP/SendGrid credentials**
Acceptance: password reset and verification emails delivered in production.

### G-4 · Realtime notifications — P3 (AUD-034)
Acceptance: a notification appears for a second signed-in user without polling delay (WebSocket or SSE).

---

## PHASE H — Testing & hardening

### H-1 · Lint configuration — P2 (AUD-026)
Acceptance: `pnpm lint` exits 0 non-interactively in api and web.

### H-2 · Promote audit suites into CI — depends on A-7
Acceptance: bp02/05/06/07/08/09 run against a seeded ephemeral database in CI.

### H-3 · Security regression tests
Acceptance: automated checks for AUD-002, AUD-003, AUD-006, AUD-007, AUD-008, AUD-013, AUD-014.

### H-4 · CORS tightening — P3 (AUD-035)
Acceptance: production allows only `https://umrahconnect.io` (and `www`); the `*.vercel.app` / `*.trycloudflare.com` allowance is dev/preview-only.

---

## PHASE I — Deployment readiness

### I-1 · Production configuration review — P3 (AUD-035, AUD-036)
Acceptance: dashboard values verified: `CORS_ORIGINS`, `WEB_URL=https://umrahconnect.io`, `STORAGE_DRIVER`, `PAYMENT_PROVIDER`, JWT secrets.

### I-2 · `www` certificate — P2 (AUD-020) — human (Vercel domains)
Acceptance: `https://www.umrahconnect.io` → 308 → apex with a valid certificate.

### I-3 · Monitoring, uptime and cold starts
Acceptance: external uptime check on `/health` with alerting; no multi-minute cold starts.

### I-4 · Deployment gate
Acceptance: pushes to `main` deploy only after CI passes; rollback procedure documented.

### I-5 · Branch hygiene — P4 (AUD-040)
Acceptance: `develop` fast-forwarded or deleted.
