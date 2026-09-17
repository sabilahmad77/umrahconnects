# Release Evidence — Claude core track

> **Superseded by INTEGRATION_RELEASE_EVIDENCE.md (2026-09-18)** for the merged
> system. The per-module contract detail below remains accurate and is what the
> web track was reconciled against.


Branch `claude/core-finalization` (worktree `/Users/macbook/Projects/umrah-connects-core-finalization`), based on `65ce3dc`. Not pushed, not deployed.

## Commands (run from `platform/api`)

| Check | Command | Result (2026-09-17) |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | 0 problems |
| Unit | `npx vitest run` | 4 files, 19 tests passed (`evidence/unit-tests.txt`) |
| E2E security | `npx vitest run --config vitest.e2e.config.ts` | 9 files, 145 tests passed; 144/144 on three consecutive earlier runs (`evidence/e2e-tests.txt`) |
| Provider integration | `STRIPE_MOCK_URL=… S3_TEST_ENDPOINT=… SMTP_TEST_HOST=… npx vitest run --config vitest.providers.config.ts` | 3 files, 11 tests passed (`evidence/provider-integration-tests.txt`) |
| Build | `pnpm build` | exit 0 |
| Container | `docker build -t umrah-connect-api:core-check .` (repo root) | built; smoke test and KVM rehearsal passed (`evidence/kvm-rehearsal.md`) |
| Migrations | `npx prisma migrate status` (core DB) · baseline diff | up to date · diff exit 0 |
| Route inventory | `npx ts-node prisma/scripts/export-route-policies.ts <file>` | 325 routes: 260 capability-gated, 40 authenticated-with-ownership, 25 public (`evidence/api-route-policies.json`) |
| Runtime QA | `python3 audit/core_runtime_qa.py http://localhost:3200 <file>` | 65/65 (`evidence/core-runtime-qa.json`) |

Runtime stack used for QA: API `http://localhost:4200/api/v1` (PID 25679 after watch restarts; 99733 at first start; cwd `…/umrah-connects-core-finalization/platform/api`), web `http://localhost:3200` (PID 99671, cwd `…/umrah-connects-core-finalization/apps/web`), PostgreSQL 15 `127.0.0.1:5433/umrah_connects_core`.

## Gates

| Requirement | Subsystem | Implementation | Test | Result | Runtime evidence | Residual limitation | Status |
|---|---|---|---|---|---|---|---|
| Super Admin separated; platform scope | RBAC | `rbac/catalog.ts`, `rbac.service.ts`, `admin.controller.ts`, `PLATFORM` tenant type | rbac.e2e, access-policy.e2e | pass | operator `/admin/*` 403 in the browser; runtime QA | — | PASS |
| Deny-by-default access policy | Guards | `permissions.guard.ts`, `access-policy.check.ts`, `access.decorator.ts` | access-policy.e2e | pass | boot log "Access policy OK — 324/325 routes" | — | PASS |
| Tenant isolation | All domains | `common/tenant-scope.ts`; module services | isolation / marketplace / payments e2e | pass | live cross-tenant probes 404 | RLS deferred (D-009) | PASS |
| Authentication & sessions | Auth | `auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `session-cookie.ts` | auth.e2e, rate-limit.e2e | pass | runtime QA (logins, throttling, cookie) | web still keeps refresh token in localStorage (XT-R01) | PASS |
| Google Sign-In | Auth | `google.service.ts` | google.e2e (token endpoint stubbed) | pass | — | real Google not exercised | PASS (code) / BLOCKED (provider) |
| Email (reset, verification) | Mail | `mail/mail.service.ts` | auth.e2e; smtp-mailpit.int | pass | forgot-password 503 without mail (container) | production SMTP credentials | PASS (code) / BLOCKED (delivery) |
| Provider onboarding & KYC | Tenancy | `tenant/onboarding.*`, `tenant.service.ts`, `storage/document-access.service.ts` | rbac.e2e lifecycle | pass | — | — | PASS |
| Stripe | Payments | `payments/providers/stripe.provider.ts`, `payments.service.ts` | stripe.provider.spec, stripe-mock.int, followups.e2e | pass | — | real test-mode run needs keys | PASS (code) / BLOCKED (provider) |
| Server-determined amounts, idempotency, webhooks | Payments | `payments.service.ts` | payments.e2e, followups.e2e | pass | sandbox intent/capture/refund via proxy | — | PASS |
| Private documents & uploads | Storage | `storage.service.ts`, `file-sniff.ts`, `documents.controller.ts`, `configure-app.ts` | rbac.e2e, file-sniff.spec, storage-s3.int | pass | nested `/uploads` 404 via proxy | real R2 bucket not exercised | PASS (code) / BLOCKED (provider) |
| Validation & mass assignment | API | typed DTOs in every module; `RawJson` | isolation.e2e mass assignment; validation-pipe.spec | pass | signup with `tenantId` → 400 | — | PASS |
| Rate limiting | API | `app.module.ts` throttlers, `throttler.guard.ts`, `client-ip.ts` | rate-limit.e2e, client-ip.spec | pass | 429 on 9th bad login via proxy | in-memory store (single instance) | PASS |
| Errors, logging, headers | API | `http-exception.filter.ts`, `configure-app.ts` | auth.e2e | pass | container: no Swagger, HSTS, CSP | — | PASS |
| Migrations & DB safety | Database | `prisma/migrations/*`, Dockerfile entrypoint | e2e global setup; container migrate from empty | pass | core DB up to date | legacy production DB needs `migrate resolve` (runbook §3) | PASS |
| Backups & restore | Infra | `infrastructure/kvm/scripts/pg-*.sh`, systemd timer | rehearsal | pass | restore drill counts; tamper refused | off-site target needs credentials | PASS (local) / BLOCKED (off-site) |
| Production configuration safety | Infra | `bootstrap/env.validation.ts` | container smoke test | pass | unsafe config refused | — | PASS |
| KVM 8 deployment readiness | Infra | `infrastructure/kvm/*` | compose/caddy validation; rehearsal | pass | — | server not provisioned; deployment not authorized | PASS (prepared) / BLOCKED (live) |
| CI | Infra | `.github/workflows/api-ci.yml` | same commands locally | pass | — | not executed on GitHub (nothing pushed) | PASS (defined) |

## Request-contract changes (for the web track)

**Auth:** register rejects `tenantId` and unknown fields; password policy 8–128 characters with a letter and a digit; `TENANT_REQUIRED` errors now include `details.tenants`; refresh/logout accept the httpOnly cookie; new routes `logout-all`, `change-password`, `verify-email/request|confirm`, `google/*`; OTP routes return 503.
**Tenancy:** `POST /tenants` is platform-only; `GET /tenants/slug/:slug` returns `{id,name,slug}` for active organizations; `POST /tenants/me/kyc` takes a typed body; new `/onboarding/organization`, `GET /tenants/me/kyc`.
**Admin:** every route needs `platform:*`; KYC reject requires `reason`; listing approve/remove return the listing; `GET /admin/settings` returns read-only runtime configuration.
**RBAC:** `/rbac/assign` limited to own organization and assignable roles; new `GET /rbac/roles`, `DELETE /rbac/assign/:userId/:roleId`.
**Hotels/transport:** strict enums, non-negative amounts, UUIDs; counters server-owned (`bookedRooms`, `bookedSeats`, `totalRooms` recomputed); shared hotels read-only (403); `POST /hotels/:id/assignments` requires `allotmentId`; capacity conflicts return 409; tasreeh routes need `transport:tasreeh:manage`.
**Bookings/pilgrims/finance/compliance/visa requests:** foreign ids return 404; booking initial status limited; payment amounts ≤ total; invoices start `DRAFT`; invoice status transitions enforced (PAID only from payments); issue/void/status need `finance:invoice:approve`; gateway payments are refunded only via `/payments/:id/refund`; visa decisions through the generic update need `visa:application:manage`; `timeline`, `tenantId`, `createdBy` are rejected.
**Payments:** intents require `invoiceId` or `bookingId`, may not exceed the balance (open intents included), and reject a provider or currency that differs from the active provider or the invoice/booking currency; new `/payments/checkout*`; `GET /payments/providers` exposes the Stripe publishable key and test mode.
**Marketplace:** listing booking totals are server-computed (per person / per group only); `status`/`paymentStatus`/`currency` are no longer accepted; public listing/vendor routes return only live listings and public vendor fields; provider booking updates follow a status transition table; `vendorId` must be the caller's own; vendor creation needs `marketplace:listing:manage`.
**Marketplace requests:** `open` is provider-only across organizations; request detail is visible only per the ownership rules; conversion is requester-only and happens once; offers cannot target your own organization's requests or closed requests.
**Groups/social/connections/notifications:** non-owners and non-members get 404; public groups expose only safe fields; social enums and lengths validated; blocked connections cannot be reopened or erased; new `GET /groups/mine`.
**Uploads/documents:** `/uploads` accepts real images only (≤ 5 MB) and serves only top-level media; documents are read via `/documents/.../url` signed links.
**Inquiries:** public create is validated and throttled (5 per 10 min); list/update are platform-only.
