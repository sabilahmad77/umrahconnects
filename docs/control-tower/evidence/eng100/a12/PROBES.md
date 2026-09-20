# A12 — adversarial probes and results

Two suites, both written by A12, both run against the candidate code:

* `platform/api/test/a12-acceptance-probes.e2e-spec.ts` — 31 API probes, run as the non-superuser
  runtime role so Row-Level Security is live (`gate-logs/a12-probes-run4.txt`, **31/31 passed**).
* `audit/a12-browser-probes.mjs` — 9 checks in real Chrome through the real `/login` form against
  the **cold-booted built artifacts** (`browser/summary.json`, **9/9 passed**).

Two of the API probes deliberately *characterise* a defect rather than assert correct behaviour;
they are named `DEFECT A12-…` and are listed as findings below. The suite is green because those
two record the behaviour that exists today, not because the behaviour is right.

Every refused mutation below is followed by a re-read of the victim record (or, for the sweeps, by a
full fingerprint of the victim organization) — a 403 alone was never accepted as proof.

## 1. Row-Level Security / tenant isolation

| Probe | How | Result |
|---|---|---|
| Cross-organization reads through the query string | Every GET route without a path parameter, taken from the **live route inventory** (`AccessPolicyCheck.inventory()`), × 5 attacker identities (operator B, hotel B, transport B, visa B, traveler B) × 30 hostile query strings: `tenantId`/`tenant_id`/`organizationId`/`orgId`/`tenant`/`tenantIds`, `filter[tenantId]`, `where[tenantId]`, `include=pilgrim,booking,invoice,payments,tenant`, `select=*`, `q`/`search`/`query`/`name`/`email`/`passportNumber` carrying A's marker, `id`/`ids`/`pilgrimId`/`bookingId`/`invoiceId`/`listingId`/`hotelId`/`vehicleId`/`groupId`/`userId` carrying A's real ids, `orderBy=tenantId` with paging, `status=ALL&includeInactive&includeAll&all`, `format=csv`, `from/to/groupBy=tenant`. Assertion: no 200 body contains A's marker string or any of A's row ids. | **PASS** — 0 leaks (67 s of requests) |
| Exports and reports | Every GET route matching `export\|report\|stats\|summary\|analytics\|dashboard`, × operator B / traveler B / hotel B (and finance A as a positive control), × three organization-pointing queries including `format=csv` | **PASS** — 0 leaks |
| Traveler-private data | Traveler B against traveler A's marketplace booking, marketplace request and checkout status; plus B's own `/marketplace/bookings/mine`, `/marketplace/requests/mine`, `/travelers/me/links`, `/travelers/me/trips`, `/notifications`, `/social/conversations` | **PASS** — A's marker never appears |
| Blind cross-organization **write** sweep | Every non-GET route in the inventory except `/payments/webhook/*` and `/auth/*`, called by operator B, with four of A's real ids substituted into every path parameter and three bodies: empty; organization-pointing; and one naming every one of A's ids plus `status: 'CANCELLED'`, `amount: 1`, `name: 'A12-OVERWRITE'`. Then a fingerprint of A: row counts for pilgrims, bookings, invoices, payments, visas, hotels, vehicles and documents **plus** the mutable state of the eight records under attack. | **PASS** — fingerprint byte-identical before and after |
| Hostile query values | The same list of list routes × `ALL`, `ANY`, `'; DROP TABLE users; --`, `../../etc/passwd`, `{"gt":""}`, `null` against `status`/`type`/`category`/`visibility`/`serviceType` | **PASS** — no 5xx, and no `prisma`/`PrismaClient`/stack frame/`syntax error at or near`/`relation "` in any envelope. (Prisma *does* throw on an unknown enum; the exception filter turns it into a clean `400 "Request contains invalid values"` — confirmed again by hand against the cold-booted API.) |

## 2. Capability minting and platform separation

| Probe | Result |
|---|---|
| 13 spellings of a platform capability into `POST /rbac/roles` — the exact keys, `PLATFORM:TENANT:READ`, leading space, trailing space, an embedded NUL, `platform::tenant:read`, mixed case, mixed with a capability the caller does hold, `__proto__`, `constructor`, `toString`, an object with a `toString`, a nested array | **PASS** — every one 400/403; afterwards no `role_permissions` row with namespace `platform` exists in the organization and `/rbac/my-permissions` holds no `platform:` key |
| Granting the **real** SUPER_ADMIN role id to self, to staff, to a traveler and to the platform account, via `POST /rbac/assign` and via `POST /admin/users/:id/roles` | **PASS** — 403/404 everywhere; no `user_roles` row created |
| Defence in depth: a `platform:tenant:read` grant written **straight into the database** for the operator admin (owner connection, bypassing the API) | **PASS** — capability resolution still yields no platform key and `/admin/tenants` is 403. A forged row does not become a capability. |
| A custom role cannot carry a capability its creator does not hold | **PASS** |
| Every platform-capability route × operator admin, traveler, hotel manager, finance manager **and a holder of a freshly minted 40-capability custom role** | **PASS** — 403 on all of them |

## 3. Traveler ↔ pilgrim invitation link

| Probe | Result |
|---|---|
| Accept once, then replay `preview`/`accept`/`decline` as the same traveler and as another | **PASS** — 403/404; the link row stays ACTIVE, same user, `tokenHash` null |
| Replay after **decline**; replay after the organization **revokes** | **PASS** — 404; `userId` stays null |
| **Expired** token | **PASS** — 404, the row is consumed to EXPIRED with `tokenHash` null, and a second attempt is still 404 |
| Wrong identity: another traveler; the inviting organization's own admin; operator B; operator staff; hotel, transport, visa and finance managers; the platform Super Admin; anonymous; and a traveler whose email is not verified | **PASS** — 403/404 (401 anonymous); the row stays INVITED with `userId` null, and the rightful owner then accepts normally |
| Four concurrent accepts of the same token | **PASS** — exactly one 2xx, exactly one ACTIVE link |

## 4. Money

| Probe | Result |
|---|---|
| Client-chosen money on `POST /payments/checkout` — `amount`, `amountCents`, `totalCents`, `currency: 'XXX'`, `priceCents`, `total`, `feeCents`, `status: 'COMPLETED'` | **PASS** — each refused **400** (the DTO whitelist rejects the request outright rather than ignoring the field), no payment row created; a clean checkout is then priced from the booking, in the booking's currency |
| IDOR on someone else's checkout — traveler B **and** operator B against traveler A's attempt: read status, sandbox-complete, read payment, refund, confirm, cancel | **PASS** — all ≥400; the payment's status, amount, currency and gateway status are unchanged afterwards |
| Double capture — four concurrent sandbox completions, then three replayed signed capture webhooks | **PASS** — exactly one `CAPTURED` ledger row, one COMPLETED payment, booking `paymentStatus` PAID and it stays there |
| Refund bounds — 10× the capture, capture + 0.01, −1 and 0 | **PASS** — all ≥400 with `refundedCents` still 0 |
| Concurrent refunds — three full refunds at once | **PASS** — exactly one succeeds; `refundedCents == amountCents`, never more |
| Paying a **cancelled** booking — cancel, then try a new checkout, then force a signed capture through | **PASS** — the new checkout is refused; the booking stays CANCELLED and unpaid; the payment goes DISPUTED with a "refund required" reason. The F1 fix is real. |
| Forged and replayed webhooks — no signature, `sha256=deadbeef`, a signature made with a foreign secret, a tampered body carrying the valid signature of the original, and an empty body | **PASS** — all ≥400; the payment stays PENDING and the booking unpaid |

## 5. Listing moderation

| Probe | Result |
|---|---|
| After a platform takedown (ARCHIVED + TAKEN_DOWN + inactive), eight owner bypass attempts: status → DRAFT / PUBLISHED / PAUSED, `isActive: true`, `moderationStatus: 'CLEAR'`, status+moderationStatus together, rename+publish, and `DELETE` — **each followed by a re-read** | **PASS** — the three-field state is unchanged after every single attempt |
| Public visibility | **PASS** — absent from public search, detail 404, a traveler cannot book it |
| Only the platform lifts it | **PASS** — `PUT /admin/listings/:id/approve` restores `CLEAR` |

## 6. Uploads and downloads

| Probe | Result |
|---|---|
| A signed link to organization A's visa document requested by operator B, visa B, traveler B and hotel B | **PASS** — all ≥400 |
| B uploading a new version into A's application | **PASS** — refused; A's document still has exactly one version |
| A's own link | **PASS** — 200 |
| The same link with a tampered payload (`key` rewritten to `../../../etc/passwd`) and with one character appended to the signature | **PASS** — 401 for both |
| Wrong type / oversize — `script.php`, `shell.php.png`, a GIF-header polyglot carrying `<script>`, a 30 MB PNG, an SVG with `onload` | **PASS** — all refused; the media registry row count is unchanged |

## 7. Session revocation inside the same second

| Probe | Result |
|---|---|
| `logout-all`, with the doomed token minted in the same wall-clock second | **PASS** — 401 at once; both sessions dead; a fresh sign-in works |
| Password change, same second | **PASS** |
| Admin force-logout, same second | **PASS** |
| Admin lock, same second | **PASS** — and the account cannot sign in again |
| A refresh token replayed after `logout-all` | **PASS** — refused |

## 8. Browser, through the real login, against the cold-booted artifacts

| Check | Result |
|---|---|
| A12-B1a — a second signed-in tab works before the revocation | **PASS** (200) |
| A12-B1b — "log out everywhere" accepted in tab 1 | **PASS** (200) |
| A12-B1c — the other tab is refused on its next action | **PASS** (401) |
| A12-B1d — the revoked tab lands on `/login`, not on stale data | **PASS** |
| A12-B2 — two tabs submitting the same new record at once | **two records created** — defect A12-1, reproduced through the UI |
| A12-B3a — a published listing is readable | **PASS** (200) |
| A12-B3b — the platform takes it down | **PASS** |
| A12-B3c — the owner cannot republish it | **PASS** (403) |
| A12-B3d — it is gone from the marketplace page | **PASS** |

Note on method: the access token lives only in page memory (the refresh token is an `HttpOnly`
cookie), so the probe reuses the exact `Authorization` header the application itself sends, observed
on the page's own requests after a real form sign-in. Nothing was injected into `localStorage` and no
token was minted outside the login flow.

## 9. The runtime role, probed directly in PostgreSQL (outside the application)

`psql` as the API's own login role (`uc_int_app`) against the development database — the check the
application cannot make for itself.

| Probe | Result |
|---|---|
| `rolsuper`, `rolbypassrls`, `rolcreatedb`, `rolcreaterole` | **f / f / f / f** |
| Tables owned by the role | **0** |
| `SELECT count(*) FROM plugin_crm.pilgrims` with no scope set | **0** — fails closed |
| `UPDATE` and `DELETE` on `audit.audit_logs` | **permission denied** — the trail really is append-only for the runtime role |
| `ALTER TABLE … DISABLE ROW LEVEL SECURITY` | **must be owner of table** |
| `DROP POLICY rls_tenant ON plugin_crm.pilgrims` | **must be owner of relation** |
| `SET ROLE macbook` (the owner) | **permission denied to set role** |
| Tables with RLS: enabled / forced / total | **36 / 36 / 36** — every RLS table is also FORCEd |
| `SELECT set_config('app.scope','system',true)` then read every organization | **30 rows returned** |

The last line is the design's own stated limit, not a hidden one: `RLS.md` §8 says "Settings are
trusted… SQL injection could call `set_config`". A12 confirmed both halves of the mitigation it
names: there is **no** `$queryRawUnsafe`/`$executeRawUnsafe` anywhere in `src/`, `test/` or
`prisma/`, all 16 raw queries are tagged templates (parameterised), and `eslint.config.mjs:24-28`
fails the build on either unsafe call — the lint gate passes with zero findings. So RLS here is
defence in depth against a **forgotten tenant filter**, which is what it claims to be, and not a
containment boundary against a compromised application credential. Recorded, not filed as a break.

## 10. Provider integration suite (containers A12 started)

`npx vitest run --config vitest.providers.config.ts` with `stripe/stripe-mock`, `minio/minio` and
`axllent/mailpit` on ports A12 owns (12412 / 19412 / 11412+18412).

| File | Result |
|---|---|
| `storage-s3.int-spec.ts` (the R2 code path against MinIO) | **5/5 pass** — including "private objects are readable only through short-lived presigned URLs" |
| `storage-cleanup-s3.int-spec.ts` | **1/1 pass** |
| `smtp-mailpit.int-spec.ts` | **2/2 pass** |
| `stripe-mock.int-spec.ts` | **2/3 — one FAILS**, see finding A12-6 |

This independently confirms A06's "MinIO 6/6" (5 + 1 = 6, both files green) and that the SMTP driver's
contract holds against a real SMTP server. Neither makes R2 or a real mailbox verified: O03 and A13
stay launch-only, correctly.

## Findings

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **A12-1** | P3 | **Duplicate-submit protection is client state in a single tab.** `apps/web/lib/single-flight.ts` joins identical overlapping writes inside one page, and says so honestly in its own comment. Records that are not money have no server-side idempotency: five identical `POST /pilgrims` create five records, and two real browser tabs signed in as the same operator do the same through the UI. Money is protected (a double-submitted checkout yields one attempt; parallel refunds yield one refund). | `a12-acceptance-probes.e2e-spec.ts` "DEFECT A12-1…"; `browser/summary.json` A12-B2 |
| **A12-3** | P2 | **Reference numbers are five random digits in a platform-wide unique space, with no retry.** `UC-<year>-<5 digits>` for bookings, `INV-…`, `BP-…`, `VISA-…` (`bookings.service.ts:95,349`, `finance.service.ts:221,952`, `compliance.service.ts:140`, `marketplace-requests.service.ts:482`) — `Math.random`, 100 000 values, and the unique index is global rather than per organization. At a few hundred records a year the birthday bound makes collisions routine, and nothing catches `P2002`: an ordinary create starts failing for the user. | `a12-acceptance-probes.e2e-spec.ts` "DEFECT A12-3…" |
| **A12-5** | P3 | **A10's DEF-004 is narrowed, not closed, although `2e3857b` says "close the three open defects".** `listing-detail.tsx` now asks for `GET /marketplace/listings/mine/:id` only when the viewer holds `marketplace:listing:manage`, which removes the failed request and console error for travelers, operator staff, finance and the platform account. But `marketplaceProvider` (`catalog.ts:140`) puts that capability in HOTEL_MANAGER, TRANSPORT_MANAGER and VISA_OFFICER as well as OPERATOR_ADMIN — four of the eight system roles, and exactly the ones who browse the marketplace commercially. A provider opening another provider's listing still gets a 404 and a console error on every view. DEF-005 and DEF-006 are genuinely closed (capability gate on Archive in both the list and the detail; `<main id="main">` on `/reset-password`). | `apps/web/components/marketplace/listing-detail.tsx:590-600`; `apps/web/hooks/use-marketplace.ts:75-84`; `platform/api/src/modules/rbac/catalog.ts:140,177-215` |
| **A12-6** | P3 | **A whole test suite is outside every gate and is currently red.** `vitest.providers.config.ts` (`test/providers/**/*.int-spec.ts`) is run by no gate — unit is `src/**/*.spec.ts`, e2e is `test/**/*.e2e-spec.ts` — yet `docs/control-tower/LOCAL_TEST_GUIDE.md:36-44` presents it as the way to verify the provider code paths. A12 ran it against real MinIO, Mailpit and stripe-mock containers: **11 pass, 1 fails**. `test/providers/stripe-mock.int-spec.ts:35` still asserts `await expect(provider.cancel('pi_123')).resolves.toBeUndefined()`, but `PaymentProvider.cancel` was changed during this loop to return `CancelResult { cancelled: boolean }` (`providers/payment-provider.ts:52,101`) — a change `PaymentsService` now depends on (`if (!res.cancelled) throw new AttemptStillLive(…)`). The unit spec `stripe.provider.spec.ts:167-173` was updated with it; this one rotted unnoticed because nothing runs it. The product behaviour is correct; the contract test is stale. | `gate-logs/providers-suite.txt` |
| A12-4 | P4 | An invitation token that is valid but belongs to another account answers `403 INVITATION_EMAIL_MISMATCH`, while an unknown token answers `404 INVITATION_INVALID`. The difference tells a token holder that the token is live. The one-message rule the service documents covers only token state, so this is a deliberate UX trade-off — recorded, not filed as a break. | `traveler-links.service.ts` `resolveInvitation` |

Not defects, checked and cleared: the `status=ALL` Prisma enum error (mapped to a clean 400); the
five skipped Stripe tests (an honest `describe.skipIf` on `STRIPE_MOCK_URL`, all five pass once the
mock is running); the production-configuration refusal on cold boot (a guard, working).
