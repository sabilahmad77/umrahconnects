# Release evidence — web integration closure loop

Branch `integration/web-final`, worktree `/Users/macbook/Projects/umrah-connects-integration`,
merge commit `001553a` (Claude core `83bc3d5` + Codex web `91ad20d`), remediation
commit `a99f948`. Nothing pushed, nothing deployed.

## Test and build results

| Check | Result |
|---|---|
| API typecheck (`tsc --noEmit`) | exit 0 |
| API lint (`eslint .`) | exit 0 |
| Web typecheck | exit 0 |
| Web lint | exit 0 |
| API unit tests | 19 / 19 |
| API e2e security suites | 146 / 146 (9 files) |
| Web tests | 58 / 58 (3 files) |
| API production build (`nest build`) | exit 0 |
| Web production build (`next build`) | exit 0 — 76 static pages, shared JS 87.6 kB, middleware 26.4 kB |
| Web build with `API_PROXY_ORIGIN` unset and `VERCEL=1` | exit 1, by design |

## Runtime evidence (real HTTP through the `/proxy-api` rewrite)

| Run | Result | File |
|---|---|---|
| Core runtime QA | **65 / 65** with rate limiting enabled | `evidence/integration-runtime-qa.json` |
| Integration acceptance | **210 / 210** with rate limiting enabled | `evidence/integration-acceptance-qa.json` |
| Integration acceptance | 211 / 211 with rate limiting disabled (one extra probe that the register rate limit otherwise skips) | same harness |

The acceptance harness is `audit/integration_acceptance_qa.py`. It is deliberately
adversarial: it creates a record with one identity and then tries to read, change,
delete, decide, list and download it with every other identity. A check passes
only when the server refuses.

Sections and counts: identities 15, Super Admin isolation 65, hotel A/B 7,
transport A/B 8, visa A/B 9, operator A/B 14, traveler A/B 5, booking/pricing 13,
mass assignment 5, signup provisioning 8, database persistence 11, status
contract 4, payments 15, documents 12, session integrity 5, error hygiene 4.

## Test identities

Nine role accounts from `prisma/scripts/seed-demo-roles.ts` plus a "B side" added
this loop in `prisma/scripts/seed-isolation-pairs.ts`, so every isolation probe
has a genuine second organization to fail against rather than an assumption:

| Role | A | B |
|---|---|---|
| Super Admin | `superadmin@umrahconnect.dev` (PLATFORM organization) | — |
| Operator | `admin@alharamain.sa` (+ staff, finance, visa officer) | `admin@kaabatravel.pk`, `admin@baitussalam.co.id` |
| Hotel | `hotel@makkahgrand.dev` | `hotel.b@madinahcomfort.dev` |
| Transport | `transport@haramaintransport.dev` | `transport.b@jeddahcoach.dev` |
| Visa agency | `visa@fastvisa.dev` | `visa.b@nusukvisa.dev` |
| Traveler | `traveler@umrahconnect.dev` | `traveler.b@umrahconnect.dev` |

Development only; the seeds refuse to run with `NODE_ENV=production`. Passwords
are the documented local default and are not recorded here.

## Targeted verifications

| Claim | How it was shown |
|---|---|
| Sign-out-everywhere revokes same-second tokens | Before the fix: register → logout-all → `/auth/me` still 200. After: 401 at 0.0 s, 0.5 s and 1.2 s gaps, and an immediate re-login still works. |
| Each client gets its own rate-limit bucket | Client A throttled at attempt 31; client B unaffected on the next request. A client-supplied `x-vercel-forwarded-for` is discarded — 36 attempts rotating a forged value all land in one bucket. |
| The refresh token never reaches page scripts | Login body is `{accessToken, expiresIn}`; the refresh cookie is absent from `document.cookie`; `localStorage` after a fresh browser login holds only `accessToken` and `currentUser`. |
| Booking totals are server-authoritative | A 1-cent client total is rejected; omitting it yields the server figure (PER_PERSON × party); checkout charges exactly that; `status`, `paymentStatus` and `currency` are refused on create. |
| Documents are private | Upload returns a `private:<key>` reference; the owner's signed URL serves the file; a tampered signature 401s; another agency and a traveler are refused. |
| A multi-workspace account can sign in | Created a real account in two organizations and confirmed the API returns the list under `error.details.tenants`, which the page now reads. |
| Cold boot reproduces | Both processes stopped and restarted from the canonical worktree; fresh PIDs with their cwd in `umrah-connects-integration`; 65/65 and 210/210 on the cold stack. |

## Browser QA

Integrated app at `http://localhost:3300` against the API on `:4300`.

- Public home, login, operator dashboard, marketplace, bookings, hotel dashboard and the Super Admin platform overview all render real seeded data.
- Zero console errors. Every `/proxy-api` call returns 200; no request loops.
- Operator navigating directly to `/admin-tenants` gets a refusal page, and the API refuses the same call independently.
- Marketplace cards show the branded category panel and the real seller name — no stock photography, no manufactured provider label.
- Booking search and the corrected status filters return 200 where they previously returned 400.
- No horizontal page scroll and no unnamed controls at 1440, 1280, 1024, 768, 390 and 360 px across operator, provider and platform routes.

## Limits of this evidence

- Traveler, transport, visa and finance journeys were exercised over the API, not walked in a browser.
- No automated WCAG audit and no screen-reader session; the accessibility claim is limited to accessible names, focus and no-overflow on the routes swept.
- Stripe, Google, SMTP and R2 are verified against local stand-ins and offline signatures only. No live provider call was made.
- The acceptance harness runs against development data. Returned records are development evidence, not production figures.
