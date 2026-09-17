# Red Team Audit — core track (2026-09-17)

Non-destructive attacks against the full API, run over HTTP against a disposable database. Every attack below is an automated test (`platform/api/test/*.e2e-spec.ts`), so it can be re-run. A subset was also run against the live development stack through the web proxy (`audit/core_runtime_qa.py`, 65 checks).

Actors (fixtures): Super Admin (PLATFORM); Operator A admin/staff/finance; Operator B admin; Hotel A/B managers; Transport A/B managers; Visa A/B officers; Traveler A/B (shared community organization).

## Attack surface and results

| Attack | Target | Result |
|---|---|---|
| **Vertical escalation** — traveler → operator, hotel, transport, visa, admin routes | every domain list route | 403 |
| Operator → Super Admin (`/admin/*` reads and mutations, `POST /tenants`, `GET /tenants/:id`, `/inquiries`) | 14 read + 6 mutation routes | 403; victim organization unchanged |
| Hotel ↔ transport ↔ visa organizations | each other's domains | 403 |
| **Role-claim tampering** — edited JWT payload (other tenant, `SUPER_ADMIN`), `alg:none`, token without `typ`, token for another tenant | `/auth/me` | 401 |
| **Grant escalation** — self-grant `SUPER_ADMIN`; grant into another organization; use another organization's custom role; hotel grants `OPERATOR_ADMIN`; custom role with platform or unheld capabilities | `/rbac/*`, `/admin/users/:id/roles` | 403/404 |
| Platform capability planted directly in the database on a tenant role | guard + catalogue sync | ignored at request time; removed by sync |
| **Tenant takeover chain** — signup with a chosen `tenantId` | `/auth/register` | 400, no user created |
| **Horizontal (IDOR)**, Operator A ↔ B — pilgrims, packages, bookings, invoices, manual payments, groups (incl. PUBLIC groups: notes, documents, incidents, posts), visa applications, visa documents, visa requests | read / update / delete / link by id | 404, data unchanged |
| Hotel A ↔ B — hotels, room types, rooms, allotments, hotel bookings, assignments; shared hotels | read / write / link | 404; shared hotels read-only (403 on write) |
| Transport A ↔ B — vehicles, drivers, routes, assignments; seat counters | read / write / link | 404; counters unchanged |
| Visa A ↔ B — applications and decisions | read / decide | 404 |
| Traveler A ↔ B — non-public posts, conversations, connections (block bypass), notifications, marketplace requests | read / act | 404 / 403 |
| **Cross-tenant linking** — A's records pointing at B's pilgrim, package, booking, vehicle, driver, route, vendor, listing | create / update | 404 |
| **Mass assignment** — `tenantId`, `createdBy`, `status`, `paidAmountCents`, `bookedSeats`, `totalAmountCents`, role fields | create / update bodies | 400 or ignored (DB verified) |
| **Payment tampering** — client amount above the balance, currency swap, provider switch, DRAFT invoice, negative amounts, client `status`; parallel intents; stale intent captured after settlement | `/payments/*` | 400/409; invoice never over-collected |
| **Marketplace price tampering** — `totalAmountCents: 1`, `status: CONFIRMED`, `paymentStatus: PAID` | listing booking create | server total and PENDING/UNPAID |
| Provider sets payment fields / jumps to PAID; other provider manages the listing | listing bookings | 400 / 404 |
| Offer abuse — offer on own organization's request, foreign vendor, accept on a closed request, second conversion, other providers' offers | `/marketplace/requests/*` | 403 / 404 / 400 / 409; offers hidden |
| **Webhook forgery** — unsigned, wrong secret, tampered body, unknown provider, replayed event, amount mismatch, live/test mode mismatch (Stripe) | `/payments/webhook/*` | 400 / 404 / duplicate / DISPUTED / ignored |
| **Signed URL abuse** — tampered local download token; tampered, re-targeted and expired S3 presigned URLs; direct object access | `/documents/signed/:token`, MinIO | 401 / 403 |
| **Document exposure** — nested `/uploads/...` paths, traversal (`..%2f`) | static media | 404 |
| **Upload bypass** — HTML/script renamed `.png`, PDF as image, image/HTML polyglot, anonymous upload, traversal-shaped storage prefix | `/uploads`, `/documents/kyc`, storage | 400 / 401 |
| **KYC document cross-reference** — submitting another organization's storage key; reading another organization's KYC file | `/tenants/me/kyc`, `/documents/kyc/...` | 403 / 404 |
| **Brute force** — repeated wrong passwords (IP and IP+email buckets), registration flood, anonymous inquiry flood | auth, inquiries | 429 with `Retry-After`; account lock after 10 failures |
| **Session abuse** — refresh token replay after rotation, access token after lock / suspend / logout-all / password change / reset | auth | 401, all sessions revoked on replay |
| **Account pre-hijack via Google** — attacker pre-registers the victim's email with a password | Google sign-in | password cleared and attacker sessions revoked when the verified owner signs in |
| Google abuse — forged `state`, missing state cookie, provider error, open redirect in `returnTo`, reusing a link intent, linking one Google account to two users, platform account via Google | `/auth/google/*` | refused with specific error codes; `returnTo` forced to `/dashboard` |
| Account enumeration — forgot-password for known vs unknown emails; login timing path | auth | identical responses; dummy bcrypt for unknown emails |
| Error leakage — malformed ids, Prisma errors | any route | 4xx envelope with request id; no stack/SQL |

## Findings raised by the red team (all fixed, all with regression tests)

| ID | Sev | Finding | Fix |
|---|---|---|---|
| RT-001 | P1 | `PUT /finance/invoices/:id/status {PAID}` marked invoices paid without payment | transition table (PAID only from payments) |
| RT-002 | P1 | `POST /groups/:id/leave` on any group; member counter could go negative | membership-checked removal, counter floor |
| RT-003 | P1 | Blocked user could delete the block and re-request | blocked rows cannot be deleted by either party |
| RT-004 | P2 | Voided/paid invoices could be re-issued | transition table |
| RT-005 | P2 | Manual payments on VOID invoices, other currencies, or labelled as gateway payments | rejected |
| RT-006 | P2 | `leadGuideId` from another organization | must be own user |
| RT-007 | P2 | Non-participant got 400 (existence leak) on conversations | 404 |
| RT-008 | P2 | Existence leaks on connections and marketplace request actions | 404 |
| RT-009 | P1 | Travelers/staff could create vendor records; vendor type mapping broke the route | `marketplace:listing:manage` + type mapping |
| RT-010 | P2 | 429 from the account throttler lacked a `Retry-After` header readable by browsers | custom guard always sets `Retry-After` |

Follow-ups raised by the red team and closed in the same loop: over-collection by parallel intents (SEC-043), accepting offers on closed requests, drafts on public listing routes, Stripe live/test mode mismatch (SEC-044), unused `finance:invoice:approve` (SEC-045).

## Not executed

- Destructive or load testing (out of scope).
- Attacks against real Google, Stripe or R2 accounts. Credentials are not available. Their protocol paths were tested with a stubbed token exchange, stripe-mock, offline Stripe signatures and MinIO.
- `X-Forwarded-For` spoofing against the production proxy chain. It needs the deployed Caddy + Vercel path. The trust rules are unit-tested (`client-ip.spec.ts`) and documented (D-020).

## Remaining known risks

- Isolation is service-layer only. RLS is deferred (D-009); every new query must use the ownership helpers. Mitigations: the typed catalogue, the boot-time policy check and the isolation suite.
- Rate limits are in-memory per API process. This is correct for a single container; they need Redis before scaling horizontally.
- The web client still stores the refresh token in `localStorage` until XT-R01 ships.

---

## Red-team re-run — web integration closure loop (2026-09-18)

Re-run against the merged branch after every integration fix, over real HTTP
through the `/proxy-api` rewrite, using genuine A/B organizations for hotel,
transport, visa, operator and traveler.

| Attack | Attempts | Result |
|---|---|---|
| Vertical escalation to platform scope | 63 direct calls: nine non-platform identities × seven platform routes, plus anonymous | All refused (401/403/404). Navigation was not relied on. |
| Role escalation by minting capability | Tenant admin creating a role holding `platform:user:read`; requesting SUPER_ADMIN in the assignable list | 403; SUPER_ADMIN is not offered. |
| Horizontal / cross-tenant access | Hotel A↔B, Transport A↔B, Visa A↔B, Operator A↔B↔C, Traveler A↔B — read, update, delete, approve, reject, void, close, list | All refused. Records verified unchanged afterwards, and absent from the other tenant's list queries. |
| IDOR on money | Confirming and reading another organization's payment; refunding without `finance:payment:refund` | 404 and 403. |
| Payment tampering | 1-cent client total; `status`/`paymentStatus`/`currency` on create; rewriting a booking total or payment state through update; paying a DRAFT invoice; an amount above the outstanding balance; a negative amount; an intent with no invoice or booking | All 400. |
| Webhook forgery | Forged sandbox signature; unsigned Stripe delivery | 400; 404 (provider not configured). |
| Document access bypass | Cross-agency signed URL; traveler requesting an organization document; a random document id; a tampered signature; `/uploads/...` and `/uploads/../.env` directly | 404, 403, 404, 401, 404. |
| Mass assignment | `tenantId` on hotel, vehicle and visa creation; `roles` and `tenantId` on signup | All 400. |
| Session misuse | Tampered signature; `alg:none`; empty bearer; no credentials; replaying a token after sign-out-everywhere | All 401, including the same-second case that INT-001 fixed. |
| Rate-limit evasion | Rotating a forged `x-vercel-forwarded-for` to escape the bucket | Discarded — 36 attempts from one real client all landed in one bucket and throttled at 31. |
| User enumeration | Unknown email versus wrong password | Identical status, code and message. |

**New defects found:** INT-001 (same-second session revocation) — fixed and
regression-tested this loop. **Remaining:** none known in code.

Accepted design risks, unchanged: service-layer-only tenant isolation (RLS
deferred, ADR-001 amendment) and an in-memory throttler (single instance).

One open security item is not a code defect: two credential-shaped tokens are in
pushed git history. See BLOCKERS.md BLK-09.
