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

## Open — assigned to the follow-up fixer (F-series) unless noted

| ID | Sev | Found by | Defect | Owner |
|---|---|---|---|---|
| F1 | P1 | A06 | A traveler can cancel a booking while an older unpaid checkout attempt is open; if that attempt is paid later, the webhook marks the cancelled booking paid | fixer |
| F2 | P2 | A06 | Admin takedown sets a listing ARCHIVED, but the owner can move it back to draft and republish — moderation bypass | fixer |
| F3 | P3 | A05 | `GET /connections/status/:userId` reveals which side blocked | fixer |
| F4 | P3 | A06 | Public routes never resolve an optional signed-in user, so inquiries from signed-in users are stored as anonymous | fixer |
| F5 | P3 | A02 | `HttpExceptionFilter` replaces every 429 message with a generic one (hides `VERIFICATION_COOLDOWN` details) | fixer |
| F6 | P3 | A04 | `GET /payments/providers` lists missing environment-variable names to any signed-in user | fixer |
| F7 | P3 | A06 | `followups.e2e-spec.ts` `includeInactive` query returns 400, so its assertion checks nothing | fixer |
| F8 | P3 | A06 | Some e2e specs write into the worktree's real `uploads/` | fixer |
| F9 | P3 | A05/A06 | Seeded marketplace sellers all belong to `al-haramain-ksa`; seeded posts carry inflated counters | fixer |
| F10 | P3 | A05 | rbac suite mutates a shared fixture, making other assertions order-dependent | fixer |
| F11 | P3 | A06 | Unused marketplace hooks in `hooks/use-api.ts` | fixer |
| F12 | P2 | A03 | `/reports/*` require `finance:report:read`; `reporting:report:read` opens nothing | A03b (assigned) |
