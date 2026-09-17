# UMRAH CONNECT — WEB INTEGRATION & FINAL CLOSURE REPORT

Loop date 2026-09-18. Local only: nothing pushed, nothing deployed.

## 1. Workspace / integration state

- **Canonical root:** `/Users/macbook/Projects/umrah-connects`, proved with `pwd -P`, the git top level and the origin remote before anything was touched.
- **Claude core track:** branch `claude/core-finalization`, worktree `umrah-connects-core-finalization`, head `83bc3d5` (7 commits).
- **Codex web track:** branch `codex/web-frontend-finalization`, worktree `umrah-connects-web-finalization`. Its work was **uncommitted** when this loop started — 95 modified and 12 new paths — and was committed to its own branch (`91ad20d`) before integration so nothing depended on a dirty worktree.
- **Integrated branch:** `integration/web-final` in a new worktree `umrah-connects-integration`, created from the core branch and merged with the web branch.
- **HEAD:** `001553a` (merge) → `a99f948` (remediation) → this documentation commit.

## 2. Claude + Codex reconciliation

The two tracks touched genuinely disjoint file sets — 153 paths under
`platform/api` versus 95 under `apps/web` — overlapping only on
`pnpm-lock.yaml`. The merge produced **no conflicts**, and `pnpm install`
confirmed the resolved lockfile. Both typechecks, both lints and all inherited
tests passed on the merged branch before a single change was made, so every
later failure was attributable to this loop.

Nothing was resolved by choosing "ours" or "theirs". Where the two tracks
disagreed it was not in the same file but in the *contract*: the frontend had
been written against the pre-hardening API. In every case the server behaviour
was treated as authoritative and the frontend was adapted to it — never the
reverse, and no backend security control was relaxed.

## 3. Backend dependencies

Nine dependencies were recorded by the frontend track. Reproduced against the
current API: **seven RESOLVED**, one **STILL BLOCKED** (traveler visa status —
a product decision about linking a traveler account to organization pilgrim
records), one **DEFERRED** (persisted preferences — no model). Two changed
shape: Google sign-in and email verification are complete and tested
server-side, but their frontend pages are not built. Detail in
`docs/ui-ux/BACKEND_DEPENDENCIES.md`.

## 4. Authentication

| Flow | Result |
|---|---|
| Registration | PASS — always provisions a real Traveler role; cannot choose its own roles or organization (both 400) |
| Login | PASS — lockout, generic errors, and an unknown email indistinguishable from a wrong password (identical status, code and message) |
| Multi-workspace login | **Fixed this loop** — the picker never appeared, so those accounts could not sign in at all |
| Logout / sign-out-everywhere | PASS — **and a P1 defect fixed**: a token minted in the same second as the revocation survived for its full 15-minute life |
| Password reset | PASS — single use, no token leakage |
| Sessions | PASS — 15-minute access tokens re-checked against the database; rotating refresh with reuse detection; refresh token now **only** in an httpOnly cookie |
| Google | Implemented and tested server-side with the token exchange stubbed. **No frontend.** Live verification needs credentials. |

## 5. Roles

Six domains, eight role codes. Super Admin lives in a dedicated PLATFORM
organization and is never bundled into Operator.

Every role was signed in through the real login form and its landing page
confirmed, not inferred from the routing table:

| Role | Lands on | What it showed |
|---|---|---|
| Traveler (`PILGRIM`) | `/travel-plan` | their **own** 4 bookings and 3 requests — not tenant-wide records — at the server-computed price, plus an honest "not available in this workspace yet" notice for group and visa tracking |
| Operator (`OPERATOR_ADMIN` / `OPERATOR_STAFF`) | `/dashboard` | 5 pilgrims, 3 hotels, 4 vehicles, SAR 17,000 collected; no platform administration in the navigation |
| Hotel (`HOTEL_MANAGER`) | `/hotel-dashboard` | hotel-scoped navigation and honest zeros (0 rooms, 0 % occupancy, SAR 0) rather than invented metrics |
| Transport (`TRANSPORT_MANAGER`) | `/transport-dashboard` | 4 vehicles, 0 drivers, 0 routes — its own fleet only |
| Visa agency (`VISA_OFFICER`) | `/visa-dashboard` | 4 applications, 3 under review, 1 approved — its own cases only |
| Finance (`FINANCE_MANAGER`) | `/finance-dashboard` | SAR 17,000 collected against SAR 16,575 outstanding, 2 paid / 1 partial / 1 issued / 1 draft |
| Super Admin (`SUPER_ADMIN`) | `/admin-dashboard` | cross-tenant platform overview: 11 organizations, 31 users, distinct navy platform chrome |

## 6. RBAC

**PASS.** 45 rbac e2e tests, a boot-time policy check over all 325 routes, and
a live capability matrix. No failures. A tenant admin cannot mint a role holding
a platform capability (403) and SUPER_ADMIN is not offered as assignable.

## 7. Tenant isolation

**PASS.** This loop added a genuine "B side" organization for hotel, transport
and visa plus a second traveler, so every probe had a real second tenant rather
than an assumption. Cross-tenant read, update, delete, decide, void, close,
list and document access were attempted for every pair — **all refused**, and
each record was re-read afterwards to confirm it was unchanged. List queries do
not leak the other tenant's rows. No confirmed cross-tenant read or modification
remains.

## 8. Core E2E workflows

**All seven roles were signed in through the real login form** and their landing
pages confirmed against real seeded data (table in §5). Domain operations —
creates, updates, status transitions, payments, refunds and document access —
were additionally driven over the API for every role, with each one's writes
re-read afterwards to prove they persisted.

The traveler view is the clearest evidence that the "tenant-wide records shown
as a personal itinerary" problem is gone: the traveler sees exactly the four
bookings and three requests that identity created, priced at the figure the
server computed.

## 9. Database

Persistence proven the hard way: create → read → **fresh login on a new
session** → list query → soft delete → status re-read. Migrations applied to a
database created from empty during this loop. Removal is a soft delete that
stays visible to its owner and refused to everyone else. No schema change on
start.

## 10. Fake / mock runtime data

Removed this loop: stock photography standing in for listing media on every
card; a manufactured "<Category> provider" label in place of the real seller; a
"Demo mode" identity placeholder; a fabricated OPERATOR workspace type; an
invented social bio; a bookmark that ignored server state; admin tiles that
counted the current page while presenting themselves as platform totals.

Remaining: none found in a production-facing path. Sandbox payments, the `log`
mail driver and the demo seeds are all gated to non-production and refuse to run
otherwise.

## 11. Stripe

Implementation and security verified as far as credentials allow: official SDK,
server-determined amounts, idempotency keys, signature verification against the
raw body, event de-duplication, amount/currency and live/test mode checks.
Tampering attempts all rejected. **The traveler-facing Stripe Elements UI is not
built** (XT-R09). Live verification is an external blocker (BLK-04).

## 12. Google Sign-In

Server-side OIDC code flow with PKCE, state and nonce, safe account linking with
an anti-pre-hijack step, platform accounts refused. Eight e2e tests with only
Google's token endpoint stubbed. **No frontend** (XT-R06). Live verification is
an external blocker (BLK-05).

## 13. Cloudflare R2

The S3-compatible driver is implemented and integration-tested against MinIO.
Document authorization was verified end to end on the local driver: upload
returns an opaque `private:` reference, the owner's signed URL serves the file,
a tampered signature is refused, and another agency or a traveler is refused.
The web side now admits the public media host. Verification against a real R2
bucket is an external blocker (BLK-02).

## 14. Browser QA

Console clean — zero errors. Every `/proxy-api` call 200, no request loops, no
stale endpoints. Routing correct per role. An operator navigating directly to a
platform route gets a refusal page *and* the API refuses the same call
independently.

## 15. Responsive / accessibility regression

Responsive: no horizontal page scroll at 1440, 1280, 1024, 768, 390 and 360 px
across operator, provider and platform routes. Accessibility: zero unnamed
controls on every route swept; the Codex track's focus, labelling and contrast
work was preserved. Full WCAG certification was **not** attempted (W31).

## 16. Tests

| | Result |
|---|---|
| Backend typecheck | exit 0 |
| Frontend typecheck | exit 0 |
| Lint (both) | exit 0 |
| Unit | 19 / 19 |
| API e2e (integration, security, RBAC, tenant, payments) | 146 / 146 |
| Web tests | 58 / 58 |
| Runtime QA through the proxy | 65 / 65 |
| Integration acceptance | 210 / 210 |
| Frontend build | PASS |
| Backend build | PASS |

Nothing skipped, nothing hidden, zero failures.

## 17. Red team

Eleven attack classes re-run after the fixes: vertical and horizontal
escalation, capability minting, IDOR on money, payment tampering, webhook
forgery, document bypass, mass assignment, session misuse, rate-limit evasion
and user enumeration. **One new defect found** (INT-001, same-second session
revocation) — fixed and regression-tested. **Remaining: none known in code.**

## 18. Infrastructure readiness

Vercel, Hostinger KVM 8, PostgreSQL and Cloudflare are documented and
locally rehearsed: non-root read-only image, compose with Caddy and TLS, health
checks at three layers, restart policy, volume persistence, migrate-on-deploy
with a backup taken first, integrity-checked backups with a rehearsed restore,
log rotation, automatic rollback on a failed health check, and firewall
expectations. Two operational gaps are recorded: the backup directory needs
`deploy` ownership creating, and `OFFSITE_REMOTE` is absent from the production
template while off-site copies are a launch requirement. Nothing was deployed.

## 19. External blockers

BLK-09 credential revocation (act first), BLK-01 KVM host + DNS, BLK-02
Cloudflare R2, BLK-03 SMTP, BLK-04 Stripe, BLK-05 Google OAuth, BLK-06 off-site
backup, BLK-07 `www` certificate, BLK-08 traveler↔pilgrim product decision.
Full detail in BLOCKERS.md.

## 20. Remaining P0

**One, and it is not a code defect.** A GitHub personal access token and a
Render API key are present in pushed git history in `.claude/settings.local.json`
(commit `5074b81`, reachable from `origin/main` and `origin/develop`). The file
is now untracked and ignored, which stops it getting worse. **Only revoking both
tokens at GitHub and Render closes the exposure, and that is the account owner's
action.**

No P0 code defects remain.

## 21. Remaining P1

No P1 code defects remain. Five frontend surfaces are unbuilt against finished
server contracts — Google sign-in, email verification, provider onboarding +
KYC, Stripe Elements checkout, settings account actions — plus
capability-driven UI guards. These are engineering work, not blockers.

## 22. Release score

- **Mandatory gates: 9 / 9 PASS.**
- **Overall verified score: 109 / 131 = 83.2.**
- Basis: the core track's 90 scored items plus 41 web/integration items. BLOCKED, DEFERRED and NOT DONE all count as not passed; nothing is excluded or averaged. FAIL count is 0.
- The score moved down from the core track's 84.4 because the denominator grew to include the web work that track excluded, not because anything regressed. On the core track's own 90 items the merged system still scores 76.
- Closing the seven open web items gives 116/131 = 88.5; with the external blockers as well, 124/131 = 94.7.

## 23. Evidence

Updated: `INTEGRATION_EXECUTION_MATRIX.md`, `INTEGRATION_RELEASE_EVIDENCE.md`,
`INTEGRATION_FINAL_REPORT.md`, `SECURITY_GATES.md`, `SCORECARD.md`,
`BLOCKERS.md`, `PROGRESS.md`, `VERIFICATION.md`, `FINDINGS_CHECKLIST.md`,
`RED_TEAM_AUDIT.md`, `CROSS_TRACK_REQUESTS.md`, `docs/ui-ux/BACKEND_DEPENDENCIES.md`.
Marked superseded, not deleted: `FINAL_REPORT.md`, `EXECUTION_MATRIX.md`,
`RELEASE_EVIDENCE.md`.
New: `audit/integration_acceptance_qa.py`,
`platform/api/prisma/scripts/seed-isolation-pairs.ts`,
`apps/web/tests/server-contracts.test.ts`, `apps/web/middleware.ts`,
`evidence/integration-runtime-qa.json`, `evidence/integration-acceptance-qa.json`.

## 24. Frontend freeze

**YES.** The approved visual system was preserved. No redesign was reopened:
every frontend change was an integration fix, a backend-contract fix, a runtime
defect, or the removal of fabricated data. The one visual consequence is
deliberate — listings without uploaded media now show the branded category panel
that the design system already defines, instead of stock photography of a
property nobody supplied.

## 25. Web engineering closure

**NO.** Nineteen of the twenty-one closure conditions are met. Two are not:
Stripe and Google are verified only as far as their unbuilt frontends allow,
and the overall score is 83.2 against a target of 95. The deficit is precisely
evidenced item by item in INTEGRATION_EXECUTION_MATRIX.md.

## 26. Mobile authorization

**NOT READY** — two reasons, in order:
1. The exposed GitHub and Render tokens must be revoked before any further release work.
2. Five user-facing surfaces a mobile client would also need (account onboarding, KYC, Google sign-in, email verification, card checkout) exist only as server contracts. Building mobile against them now would repeat the contract drift this loop just spent its time repairing.

The backend and core are stable enough to support that phase once those are closed.

## 27. Final gate

UMRAH WEB FINAL CLOSURE GATE: BLOCKED
