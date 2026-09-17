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

## Status

Maintained in the reconciliation table below as work lands.
