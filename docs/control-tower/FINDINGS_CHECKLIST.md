# Canonical Finding Registry

Single registry for the Claude core track. Sources: `docs/audit/PRODUCTION_BLOCKERS.md` (AUD-xxx, 2026-09-17), core-loop code audits (SEC-xxx, 2026-09-17, three read-only audit passes over every controller and service), Codex `docs/ui-ux/BACKEND_DEPENDENCIES.md` (XT-xxx).

Status: OPEN · IN PROGRESS · FIXED (code changed) · VERIFIED (automated test or runtime proof) · SUPERSEDED · BLOCKED · DEFERRED.
Final status and evidence are recorded in the table at the bottom and in `RELEASE_EVIDENCE.md`.

## Security — authorization / tenancy (core audit)

| ID | Sev | Subsystem | Finding (evidence = file:line at `65ce3dc`) |
|---|---|---|---|
| SEC-001 | P0 | RBAC | `/admin/*` gated by tenant perms held by every Operator Admin (= AUD-002), incl. `/admin/listings`, `/admin/bookings`, `/admin/finance` |
| SEC-002 | P0 | RBAC | `POST /rbac/assign` assigns any roleId to any userId, no tenant check (`rbac.service.ts:175`) → takeover chain with SEC-004 |
| SEC-003 | P0 | RBAC | `POST /rbac/roles` accepts any permission string incl. ones caller lacks (`rbac.service.ts:183`) |
| SEC-004 | P0 | Auth | `POST /auth/register` accepts client `tenantId` → join any tenant (`auth.service.ts:78`) |
| SEC-005 | P0 | Auth | OTP verify auto-creates ACTIVE user in client-chosen tenant; code from `Math.random`; attempts never incremented; code logged; no SMS (`auth.service.ts:166-230`) |
| SEC-006 | P0 | Admin | `assignUserRole` allows global roles to users in any tenant (`admin.service.ts:260`) |
| SEC-007 | P0 | Plugins | install/disable have no permission (`plugin-host.controller.ts:21`) |
| SEC-008 | P0 | Hotels | findOne/update/remove/room types/rooms/hotel bookings/allotment/assignment by id without tenant (= AUD-003; `hotels.service.ts:46-383`) |
| SEC-009 | P0 | Transport | createAssignment links foreign vehicle/route/driver/booking/group and increments their seats (`transport.service.ts:348`) |
| SEC-010 | P0 | Compliance | createVisa accepts foreign pilgrimId; findVisaById loads pilgrim unscoped → passport leak (`compliance.service.ts:43-58`) |
| SEC-011 | P0 | Payments | sandbox provider always registered; webhook secret falls back to a known constant; `PAYMENT_PROVIDER` defaults to sandbox in production (`payments.service.ts:26,37`) |
| SEC-012 | P0 | Groups | findOne guard admits other tenants' PUBLIC groups for writes; deletePost/updateNote/deleteNote/deleteDocument/closePoll/updateIncident by id only; addPilgrim moves foreign booking (`groups.service.ts`) |
| SEC-013 | P0 | Marketplace | createBooking takes client `totalAmountCents`, `status`, `paymentStatus` (`marketplace.service.ts:173`) |
| SEC-014 | P0 | Marketplace | updateListing/deactivateListing/updateBooking/respondToQuote/acceptQuote by id only; createListing accepts foreign vendorId |
| SEC-015 | P0 | Mkt requests | convertOfferToBooking has no caller check and links foreign vehicle/route/listing; createOffer accepts foreign vendorId |
| SEC-016 | P1 | Hotels | getRoomTypes/getRooms/createAllotment unscoped |
| SEC-017 | P1 | Bookings | create/addPilgrim link foreign package/pilgrims; invoice copies foreign pilgrim name |
| SEC-018 | P1 | Transport | routes/assignment updates/tasreeh link foreign vehicle/driver |
| SEC-019 | P1 | Pilgrims | familyGroupId unchecked |
| SEC-020 | P1 | Finance/Payments | invoice/payment link foreign booking/pilgrim/vendor |
| SEC-021 | P1 | Compliance/Visa req. | submissions/requests link foreign operator/pilgrim/visa ids |
| SEC-022 | P1 | Tenant | KYC submit has no permission and untyped body |
| SEC-023 | P1 | Inquiries | public inquiries readable by every operator admin |
| SEC-024 | P1 | Groups | comments/votes without membership; invite by id; public list leaks briefing/emergency data |
| SEC-025 | P1 | Social | getPost/feed ignore visibility; author objects leak phone/nationality |
| SEC-026 | P1 | Connections | blocked user can re-open request |
| SEC-027 | P1 | Marketplace | listing inquiries/bookings readable by any vendor; public vendor endpoints leak KYC docs |
| SEC-028 | P1 | Mkt requests | listOpen leaks community travelers' requests; = AUD-009/AUD-013 |
| SEC-029 | P2 | All | untyped `@Body() any` on mutation routes (hotels, bookings, transport, finance, compliance, groups, social, marketplace, requests, inquiries, tenant) → client-set status/amount fields |
| SEC-030 | P2 | Finance | refundPayment not capped |
| SEC-031 | P1 | Auth | password reset link + token logged in all environments; dev link returned when NODE_ENV≠production (= AUD-015) |
| SEC-032 | P2 | Auth | `expiresIn` hardcoded 900 regardless of JWT_EXPIRES_IN |
| SEC-033 | P1 | CORS | any `*.vercel.app` / `*.trycloudflare.com` origin allowed with credentials in production (= AUD-035) |
| SEC-034 | P2 | Admin | `getSettings` returns static "feature flags" presented as settings |
| SEC-035 | P2 | Events | Kafka defaults to enabled |
| SEC-036 | P1 | Deploy | Dockerfile runs `prisma db push --accept-data-loss` on every boot |
| SEC-037 | P2 | Marketplace | rateVendor DTO has no validators (always 400); anonymity stored as verified |

## Carried from the 2026-09-17 audit

AUD-001 … AUD-041 as listed in `docs/audit/PRODUCTION_BLOCKERS.md`.

## Cross-track (Codex)

| ID | Dependency |
|---|---|
| XT-001 | Signup must provision a working role / activation state |
| XT-002 | Current-user group membership query |
| XT-003 | Current-user visa status query |
| XT-004 | Server-authoritative marketplace pricing |
| XT-005 | Persisted settings/preferences endpoints |
| XT-006 | Google sign-in and email verification contracts |
| XT-007 | Platform scope enforcement for /admin |
| XT-008 | Real accounts for every role |
| XT-009 | Local API availability for QA |

## New findings during implementation

| ID | Sev | Finding | Fix |
|---|---|---|---|
| SEC-038 | P1 | `.dockerignore` excluded only the root `.env`, so `platform/api/.env*` were copied into locally built images | exclude env files at any depth; production ignores env files |
| SEC-039 | P2 | Error filter overwrote custom error codes (`TENANT_REQUIRED` and its tenant list never reached clients); Prisma errors surfaced as 500 | codes and details preserved; P2025/P2002/P2003/P2023 mapped to 4xx |
| SEC-040 | P1 | Global `enableImplicitConversion` turned objects inside untyped DTO arrays into `[]` (KYC documents stored as `[[]]`) | `@RawJson()` on free-form JSON fields + regression test |
| SEC-041 | P2 | Every browser request reaches the API from the web host's shared egress IPs → per-IP limits would pool all users | proxy-authenticated client IP (D-020) |
| SEC-042 | P2 | Backup scripts sourced the env file with the shell (breaks on metacharacters); a missing optional key aborted backups silently | safe key lookup; tolerant of missing keys |
| SEC-043 | P2 | Parallel payment intents could together exceed the outstanding balance | open intents reserve the balance; server-side captures re-check it |
| SEC-044 | P2 | Offers could be accepted on closed/expired requests; public listing routes returned drafts/archived listings; Stripe events not checked for live/test mode | status/expiry checks; public routes show only PUBLISHED+active; mode mismatch ignored |
| SEC-045 | P3 | `finance:invoice:approve` existed but issue/void/status used `create` | approve enforced (staff 403) |
| RT-001…RT-010 | P1/P2 | Red-team findings (see RED_TEAM_AUDIT.md) | fixed with tests |

## Final reconciliation

Evidence keys: **U** unit test · **E** e2e security test (`platform/api/test/*.e2e-spec.ts`) · **I** provider integration test · **R** runtime QA through the web proxy (`audit/core_runtime_qa.py`) · **B** in-browser check · **C** container/rehearsal (`evidence/kvm-rehearsal.md`) · **D** decision/doc.

### Security (SEC)

| ID | Final status | Evidence |
|---|---|---|
| SEC-001 | VERIFIED CLOSED | E rbac "every tenant role gets 403 on every platform route"; R; B (operator `/admin/*` → 403) |
| SEC-002 | VERIFIED CLOSED | E rbac "cannot grant SUPER_ADMIN", "another organization" |
| SEC-003 | VERIFIED CLOSED | E rbac "custom roles cannot carry platform capabilities…"; R |
| SEC-004 | VERIFIED CLOSED | E auth "rejects a client-chosen organization"; R |
| SEC-005 | VERIFIED CLOSED | E auth "phone OTP is unavailable"; D-014 |
| SEC-006 | VERIFIED CLOSED | E rbac "Super Admin can grant SUPER_ADMIN only to platform accounts" |
| SEC-007 | VERIFIED CLOSED | policy inventory (`core:tenant:update`); E access-policy |
| SEC-008 | VERIFIED CLOSED | E isolation (hotels); R (AUD-003 probes) |
| SEC-009 | VERIFIED CLOSED | E isolation (transport assignments, seat counters) |
| SEC-010 | VERIFIED CLOSED | E isolation (compliance pilgrim link / leak) |
| SEC-011 | VERIFIED CLOSED | C (sandbox webhook 404 in production); env validation; E payments |
| SEC-012 | VERIFIED CLOSED | E isolation (groups) |
| SEC-013 | VERIFIED CLOSED | E marketplace "server computes the price…" |
| SEC-014 | VERIFIED CLOSED | E marketplace "another provider cannot manage…" |
| SEC-015 | VERIFIED CLOSED | E marketplace "converts exactly once…" |
| SEC-016 | VERIFIED CLOSED | E isolation (room types, rooms, allotments) |
| SEC-017 | VERIFIED CLOSED | E isolation (bookings) |
| SEC-018 | VERIFIED CLOSED | E isolation (routes, tasreeh) |
| SEC-019 | VERIFIED CLOSED | E isolation (pilgrims) |
| SEC-020 | VERIFIED CLOSED | E isolation (invoices, payments) |
| SEC-021 | VERIFIED CLOSED | E isolation (visa requests, submissions) |
| SEC-022 | VERIFIED CLOSED | E rbac onboarding/KYC lifecycle |
| SEC-023 | VERIFIED CLOSED | E rbac (`/inquiries` 403 for tenants) |
| SEC-024 | VERIFIED CLOSED | E isolation (group comments/votes/invites, public fields) |
| SEC-025 | VERIFIED CLOSED | E isolation (social visibility) |
| SEC-026 | VERIFIED CLOSED | E isolation (connections block) |
| SEC-027 | VERIFIED CLOSED | E marketplace "public listing and vendor routes never expose…" |
| SEC-028 | VERIFIED CLOSED | E marketplace "providers browse open requests; travelers cannot…" |
| SEC-029 | VERIFIED CLOSED | E isolation "mass assignment"; typed DTOs across modules |
| SEC-030 | VERIFIED CLOSED | E payments/isolation (refund caps) |
| SEC-031 | VERIFIED CLOSED | E auth "password reset tokens are single-use, never returned…"; R |
| SEC-032 | VERIFIED CLOSED | `expiresIn` from `JWT_EXPIRES_IN` (auth.service `accessTtlSeconds`) |
| SEC-033 | VERIFIED CLOSED | E auth "CORS only reflects configured origins"; env validation |
| SEC-034 | VERIFIED CLOSED | `getSettings` returns `editable:false` runtime configuration |
| SEC-035 | VERIFIED CLOSED | Kafka default `false`; C (boot without Kafka) |
| SEC-036 | VERIFIED CLOSED | C (image never migrates on start; `migrate` is explicit) |
| SEC-037 | VERIFIED CLOSED | E marketplace (vendor rating) |
| SEC-038 | VERIFIED CLOSED | C (image contains only `.env.example`) |
| SEC-039 | VERIFIED CLOSED | E auth "TENANT_REQUIRED with the workspace list"; "never leaks stack traces" |
| SEC-040 | VERIFIED CLOSED | U `validation-pipe.spec.ts`; E rbac KYC documents |
| SEC-041 | FIXED (backend) / web header pending XT-R05 | U `client-ip.spec.ts` |
| SEC-042 | VERIFIED CLOSED | C rehearsal |
| SEC-043 | VERIFIED CLOSED | E follow-ups "parallel payment attempts…" |
| SEC-044 | VERIFIED CLOSED | E follow-ups (closed requests, drafts, livemode) |
| SEC-045 | VERIFIED CLOSED | E follow-ups "issuing and voiding invoices requires finance:invoice:approve" |

### 2026-09-17 audit (AUD)

| ID | Sev | Final status | Evidence / note |
|---|---|---|---|
| AUD-001 | P0 | **BLOCKED (external)** | Render service unresponsive; replacement host prepared (KVM runbook, rehearsal). Needs server access + DNS. |
| AUD-002 | P0 | VERIFIED CLOSED | = SEC-001 |
| AUD-003 | P0 | VERIFIED CLOSED | = SEC-008; R live probe 404 |
| AUD-004 | P1 | VERIFIED CLOSED | 8 system roles; real accounts per role; R `/auth/me` roles |
| AUD-005 | P1 | VERIFIED CLOSED | E auth registration; R "new traveler can read feed and marketplace" |
| AUD-006 | P1 | VERIFIED CLOSED | E rbac (nested `/uploads` 404, signed links); R |
| AUD-007 | P1 | VERIFIED CLOSED | E rate-limit; R (429 on the 9th attempt) |
| AUD-008 | P1 | VERIFIED CLOSED | E rbac; R |
| AUD-009 | P1 | VERIFIED CLOSED | E marketplace (cross-tenant discovery) |
| AUD-010 | P1 | FIXED — **production delivery BLOCKED (SMTP credentials)** | I Mailpit SMTP delivery; E reset/verify flows |
| AUD-011 | P1 | FIXED — **R2 verification BLOCKED (credentials)** | I MinIO (S3 code path); local driver requires a persistent volume in production |
| AUD-012 | P1 | VERIFIED CLOSED (local) / CI not yet executed on GitHub | 19 unit + 144 e2e + 11 integration tests; `.github/workflows/api-ci.yml` |
| AUD-013 | P2 | VERIFIED CLOSED | E marketplace findOne rules |
| AUD-014 | P2 | VERIFIED CLOSED | E auth single-use reset |
| AUD-015 | P2 | VERIFIED CLOSED | no token logging outside the dev log driver; production refuses `MAIL_DRIVER=log` |
| AUD-016 | P2 | VERIFIED CLOSED | typed catalogue; `core:tenant:admin` replaced by `platform:tenant:read`; `hotel:assignment:manage` granted |
| AUD-017 | P2 | DEFERRED → Codex (frontend) | landing-page metrics are web content |
| AUD-018 | P2 | DEFERRED → Codex (frontend) | KPI deltas |
| AUD-019 | P2 | DEFERRED → Codex (frontend) | phone layout |
| AUD-020 | P2 | **BLOCKED (external)** | `www` certificate — Vercel domain setting |
| AUD-021 | P2 | DEFERRED (mobile out of scope) | |
| AUD-022 | P2 | FIXED — **live test-mode verification BLOCKED (Stripe keys)** | I stripe-mock; E webhooks (offline signatures) |
| AUD-023 | P2 | DEFERRED → Codex (frontend) | |
| AUD-024 | P2 | FIXED (backend) → Codex UI guard (XT-R02) | `/auth/me` returns capabilities |
| AUD-025 | P3 | VERIFIED CLOSED | E auth "locking a user invalidates their live access token immediately" |
| AUD-026 | P2 | VERIFIED CLOSED (API) | `pnpm --filter @umrah-connects/api lint` 0 problems; web lint → Codex |
| AUD-027 | P3 | DEFERRED → Codex (frontend) | |
| AUD-028 | P3 | DEFERRED | seed data realism (development data only) |
| AUD-029 | P4 | DEFERRED → Codex | |
| AUD-030 | P3 | DEFERRED → Codex / Vercel | |
| AUD-031 | P4 | DEFERRED → Codex (XT-R11) | |
| AUD-032 | P3 | VERIFIED CLOSED | U file-sniff; E uploads |
| AUD-033 | P3 | VERIFIED CLOSED | = SEC-007 |
| AUD-034 | P3 | DEFERRED | realtime transport not required for launch; marketing copy → Codex |
| AUD-035 | P3 | VERIFIED CLOSED | = SEC-033 |
| AUD-036 | P3 | VERIFIED CLOSED | production requires https `WEB_URL`; render.yaml corrected |
| AUD-037 | P4 | VERIFIED CLOSED | env templates list only variables that are read |
| AUD-038 | P3 | DEFERRED | background jobs (overdue invoices, expiry reminders) → LOOPS_BACKLOG |
| AUD-039 | P4 | VERIFIED CLOSED | settlement + reconciliation in one transaction |
| AUD-040 | P4 | DEFERRED (repository hygiene, needs a push decision) | |
| AUD-041 | P2 | SUPERSEDED by D-009 | ADR amended; service-layer isolation verified; RLS in backlog |

### Red team (RT) — all VERIFIED CLOSED, see RED_TEAM_AUDIT.md.

### Cross-track (XT) — see CROSS_TRACK_REQUESTS.md

| ID | Final status |
|---|---|
| XT-001 | VERIFIED CLOSED |
| XT-002 | VERIFIED CLOSED (`GET /groups/mine`, E follow-ups) |
| XT-003 | BLOCKED — product decision (pilgrim ↔ user link) |
| XT-004 | VERIFIED CLOSED |
| XT-005 | DEFERRED WITH JUSTIFICATION (no preferences model; not a launch requirement) |
| XT-006 | VERIFIED CLOSED (backend; E google, E auth) |
| XT-007 | VERIFIED CLOSED |
| XT-008 | VERIFIED CLOSED (development accounts; R logins for all roles) |
| XT-009 | VERIFIED CLOSED |

**Remaining P0/P1 code defects: none.** Remaining P0/P1 items are external: AUD-001 (production host), and the provider verifications inside AUD-010/AUD-011/AUD-022.
