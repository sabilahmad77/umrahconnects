# Engineering 100 — defect log

Every defect found during this loop, by the worker that found it. Severity:
P0 exposure/critical, P1 security or money/data integrity, P2 functional, P3
minor/hygiene. "Fixed" means fixed on the integrated candidate with a test or
browser check named in the worker's report; open items carry their owner.

## Fixed during wave 1 (on the candidate)

| ID | Sev | Found by | Defect | Fix |
|---|---|---|---|---|
| D-01 | P1 | A03 | `GET /admin/users` spread full user rows — password hashes and MFA secrets reached the browser | explicit select + e2e secret sweep over `/admin`, `/tenants`, `/rbac` (A03 `5a40d32`) |
| D-02 | P1 | A04 | A declined Stripe attempt was marked failed, releasing its hold and allowing a second charge | declined attempts stay payable on the same PaymentIntent (A04 `8149a4b`) |
| D-03 | P1 | A04 | A webhook that failed mid-processing was recorded as done, so the provider retry was ignored | event recorded only after success; 503 on failure (A04) |
| D-04 | P1 | A04 | Parallel requests could open two attempts for one balance; parallel refunds/manual payments could exceed what was owed | per-invoice/booking row locks (A04) |
| D-05 | P1 | A04 | Card payments overwrote a booking's paid amount (lost deposit); invoice payments never updated the booking; booking→invoice carried the deposit without a payment record (double collection) | server-owned money on invoices and bookings (A04 `c0178d4`) |
| D-06 | P1 | A04 | Staff without payment rights could type a paid amount/status; invoices created via bookings without `finance:invoice:create`; cancel with only update rights | capability checks + server-owned fields (A04) |
| D-07 | P1 | A04 | Payments recordable on DRAFT invoices; `DELETE` bypassed invoice rules | lifecycle enforced (A04) |
| D-08 | P2 | A04 | Missing raw body on a webhook returned 200 (provider stopped retrying) | 400 (A04) |
| D-09 | P2 | A04 | Resuming an open checkout would fail against real Stripe (mismatched idempotency parameters) | fixed + stripe-mock suite (A04) |
| D-10 | P2 | A05 | **Reported by the owner:** comments beyond the first two never appeared; no comment list, reply or edit | paged comment API, replies, edit/delete (A05) |
| D-11 | P2 | A05 | Every traveler's posts showed the author as "User" | real names on auto-created accounts, legacy rows repaired (A05) |
| D-12 | P2 | A05 | Inbox lost conversations once the platform had >200; travelers could not read/post/vote in their own groups; feed hid own non-public posts | fixed with e2e (A05) |
| D-13 | P2 | A05 | Group document links accepted `javascript:` URLs | http(s) only (A05) |
| D-14 | P2 | A02 | Web client skipped token refresh for every `/auth/*` call, so settings actions failed after 15 minutes | fixed (A02) |
| D-15 | P2 | A02 | Wrong password attempts could lock a Google-only account (denial of Google sign-in) | fixed (A02) |
| D-16 | P2 | A02 | Google cancel showed as a generic failure; link errors bounced to /login; default returnTo /dashboard sent travelers to a forbidden page | fixed (A02) |
| D-17 | P2 | A02 | Google library error text put the whole ID token into logs | redacted (A02) |
| D-18 | P2 | A03 | Tenant status dropdown could activate an organization that never passed KYC | explicit suspend/lift/restore/archive; ACTIVE only through KYC approval (A03) |
| D-19 | P2 | A06 | Private documents always replaced the current tab (`window.open` with `noopener` returns null) | new tab without opener, fresh signed link per click (A06) |
| D-20 | P2 | A07 | Pilgrim Bookings tab crashed for bookings outside the first page | fixed (A07) |
| D-21 | P2 | A03 | `/finance/stats` fetched for staff without `finance:report:read` → "Permission required" on a permitted page | gated (A01 `41fbacb`) |
| D-22 | P2 | A03 | `GET /finance/payments` authorized on invoice-read instead of payment-read | payment-read (A01 `41fbacb`) |
| D-23 | P3 | A03/A04 | `bg-midnight` used but undefined (dialog overlay, tooltips); quiet-button hover wiped chip colours | palette + overlay hover (A01 `41fbacb`) |
| D-24 | P3 | A07 | `apps/web/tsconfig.tsbuildinfo` tracked and rewritten by every tsc run | untracked (A01 `e22a796`) |
| D-25 | P3 | A06 | `.gitignore` `uploads/` hid new files under `src/modules/uploads/` | anchored rule (A01 `f5203e7`) |

## Fixed in wave 2 (fixers and coordinator)

| ID | Sev | Found by | Defect | Fix |
|---|---|---|---|---|
| F1 | P1 | A06 | A traveler could cancel a booking with an older unpaid checkout attempt open; a later capture marked the cancelled booking paid | cancel closes every open attempt at the provider inside the same serialised section; a capture for a closed record is held as DISPUTED/CAPTURED_AFTER_CANCEL for refund and never revives it (FX1 `cace220`; e2e `payments-cancellation` 15) |
| F2 | P2 | A06 | Admin takedown only archived a listing, so its owner could republish it | real moderation state (migration `20260918190000_listing_moderation`), owner cannot change a taken-down listing (403 with the reason), public routes exclude it, only a platform capability restores (FX1 `6804354`) |
| F13 | P2 | A03b | Hotel bookings, trips and visa cases showed a payment status that could never change | field removed from payloads, DTOs and screens; dashboards show booked value instead of invented revenue (FX1 `645e9fd`) |
| F14 | P2 | A06 | Offer conversion wrote bookings and trips without the workflow's availability and clash checks | conversion routed through the same workflow helpers (FX1 `6804354`) |
| F4, F6, F18 | P3 | A06/A04/A09 | Inquiries from signed-in users stored as anonymous; `/payments/providers` leaked missing env names; webhook empty-body handling | optional-principal decorator, capability-gated provider detail, uniform 400 (FX1) |
| F19 | P1 (prod) | A08 | The KVM stack ran the API as the database owner, which bypasses every RLS policy | runtime login in compose, one-off migrate service, role script in deploy, `/health/ready` 503 `DATABASE_ROLE_UNSAFE`; rehearsed in Docker with cross-tenant probes refused (FX2) |
| F3, F5, F7, F8, F9, F11, F15, F16, F17 | P3 | A05/A02/A06/A03b/A09 | Block-direction leak, generic 429 messages, a test that asserted nothing, e2e writing into the real uploads folder, unrealistic seeds, dead hooks, swallowed dialog errors, trip-read capability, dev stack on all interfaces with default passwords | all fixed with tests (FX2) |
| D-26 | P2 | FX1 | `PUT /finance/invoices/:id` accepted VOID/CANCELLED with only `finance:invoice:create`, bypassing the approval capability | refused with `INVOICE_CLOSE_REQUIRES_APPROVAL`; e2e `finance-approval` 2/2 (A01 `5875835`) |
| DEF-001 | P2 | A10 | `POST /marketplace/requests` had no capability check — a finance-only account and a Super Admin could publish requests | `marketplace:listing:read` plus an explicit platform refusal on the traveler-facing request and booking routes (FX1 `a433c0d`; re-verified by A10) |
| DEF-002 | P2 | A10 | `/reports` demanded `finance:report:read` while the API serves the operational reports on `reporting:report:read` | route rule aligned with the server; two tests that encoded the wrong expectation corrected (A01 `1f2431d`; re-verified by A10) |
| DEF-003 | P3 | A10 | A fast double-click created duplicates on ten surfaces | single-flight guard on the shared API client joins identical in-flight writes (FX1 `eab88d2`; re-verified by A10) |
| DEF-004 | P3 | A10 | Every buyer's listing view fired the owner-only `/listings/mine/:id` and logged a 404 | requested only where the account can manage listings (A01 `2e3857b`) |
| DEF-005 | P3 | A10 | Operator staff were offered Archive on pilgrims although the API requires `crm:pilgrim:delete` | gated on that capability in the list and the detail (A01 `2e3857b`) |
| DEF-006 | P3 | A10 | `/reset-password` had no `<main>`, so "skip to content" had no target | landmark added (A01 `2e3857b`) |

## Open



| ID | Sev | Found by | Defect | Status |
|---|---|---|---|---|
| F10 | P3 | A05 | The rbac suite mutated a shared fixture, making other suites order-dependent | **Fixed** by A08 (`test/fixtures.ts` resets each fixture user per file) |
| F12 | P2 | A03 | `/reports/*` required `finance:report:read`, so `reporting:report:read` opened nothing | **Fixed** by A03b (operational reports on `reporting:report:read`, money on `finance:report:read`, CSV export gated) |
| D-27 | P3 | FX1 | A chargeback on money already held (AMOUNT_MISMATCH or CAPTURED_AFTER_CANCEL) is recorded at the provider but not in our ledger — `openDispute`/`closeDispute` skip held payments | **Open** — pre-existing pattern, no money moves without a human decision |
| D-28 | P3 | FX2 | 24 further unused exports in `apps/web/hooks/use-api.ts` (reports, compliance, social, transport) | **Open** — dead code only |
| D-29 | P3 | FX2 | `Dockerfile` header comment still names the old migrate service | **Open** — comment only |
| D-30 | P3 | A03b | `GET /transport/assignments` read routes were deny-by-default against the catalogue | **Fixed** by FX2 (F16) |
| D-31 | P3 | FX1 | A DTO declared above a second `class-validator` import crashed `nest start`; the e2e suite cannot catch that class of bug (swc hoists imports) | **Fixed** (`a2b217b`); the candidate's cold boot from the built artifacts is now part of the gate |
