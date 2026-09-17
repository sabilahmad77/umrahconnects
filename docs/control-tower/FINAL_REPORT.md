# CLAUDE CODE — UMRAH CONNECT CORE FINALIZATION REPORT

> **Superseded by INTEGRATION_FINAL_REPORT.md (2026-09-18).** This report covers
> the backend track alone, before the Codex frontend was merged. Its findings
> stand except where the integration loop re-verified them — see the
> "Re-verified from the core matrix" section of INTEGRATION_EXECUTION_MATRIX.md,
> which records that session revocation (S18) and secret hygiene (S23) did not
> hold as originally scored.

## 1. Workspace
- **Canonical root:** `/Users/macbook/Projects/umrah-connects`. This was verified with `pwd -P`, the git top level, the origin remote and `verify-workspace.sh`.
- **Branch/worktree:** `claude/core-finalization`, checked out in the worktree `/Users/macbook/Projects/umrah-connects-core-finalization`.
  - The branch was created from `65ce3dc`.
  - Codex works in its own worktree, `codex/web-frontend-finalization`.
- **Commits:** local only (`15caaa8` … `be76d2b` plus the documentation commit). Nothing was pushed or deployed.

## 2. Control Tower
- **Location:** `docs/control-tower/`, indexed in `CONTROL_TOWER.md`.
- **Files:** all 25 requested documents, plus the LOOP00A-R workspace set and `evidence/`.
- **Evidence folder:** unit, e2e and provider test outputs; runtime QA JSON; the route policy inventory; the KVM rehearsal.

## 3. Security
- **P0:**
  - 15 code findings from the core audit (SEC-001…015).
  - Audit findings AUD-002 and AUD-003.
  - AUD-001, which is an infrastructure outage.
- **P1:**
  - Core audit: 13 (SEC-016…028) plus SEC-031, SEC-033, SEC-036, SEC-038 and SEC-040.
  - Audit: AUD-004…012.
  - Red team: RT-001, RT-002, RT-003, RT-009.
- **Resolved:** every P0/P1 code finding is verified closed, each with a regression test or runtime proof.
- **Open:**
  - AUD-001 (production host, external).
  - Credential-dependent verification of AUD-010 (SMTP), AUD-011 (R2) and AUD-022 (Stripe). The code for all three is complete and integration-tested against local stand-ins.

## 4. Authentication
- **Email/password:**
  - Signup always creates a Traveler.
  - Email-first login with account lockout, a generic error message and equal timing for unknown emails and wrong passwords.
  - Passwords are hashed with bcrypt (cost 12).
  - Reset and verification tokens are single-use and delivered by SMTP; 503 when no mail transport is configured.
  - Change-password is available.
- **Sessions:**
  - 15-minute access JWTs, re-checked against the database on every request.
  - Rotating refresh tokens with reuse detection, also set as an httpOnly `__Host-` cookie.
  - Logout, logout-all, and immediate revocation on lock, suspension or password change.
  - Phone OTP is disabled (no SMS provider).
- **Google Sign-In:**
  - Server-side OIDC code flow with PKCE, state and nonce.
  - The browser gets a single-use ticket in the URL fragment.
  - Safe account linking, including an anti-pre-hijack step; platform accounts are refused.
  - Tested end to end with only Google's token exchange stubbed (8 tests).
  - Verification with real Google credentials is **BLOCKED BY EXTERNAL CREDENTIALS**.

## 5. Role Architecture
- **Traveler:**
  - `PILGRIM` (shown as "Traveler"), in the shared community organization.
  - Marketplace, requests, checkout, social, and the groups they belong to.
  - No organization-wide reads.
- **Operator:** `OPERATOR_ADMIN` (all organization capabilities) and `OPERATOR_STAFF` (operational subset). Both apply only inside their own organization.
- **Hotel:** `HOTEL_MANAGER` — properties, rooms, inventory, allotments, assignments, invoices, marketplace provider, own team.
- **Transport:** `TRANSPORT_MANAGER` — vehicles, drivers, routes, trips, tasreeh, invoices, marketplace provider, own team.
- **Visa Agency:** `VISA_OFFICER` — visa cases (submit/decide), traveler records, documents, marketplace provider.
- **Super Admin:**
  - `SUPER_ADMIN`, only in the dedicated `PLATFORM` organization.
  - Holds `platform:*` capabilities only; not bundled into Operator.
  - Bootstrapped in production without a default password.
- **Finance capability decision (D-004):**
  - There is no global Finance role.
  - Finance is a set of scoped capabilities (`finance:invoice:read/create/approve`, `finance:payment:read/process/refund`, `finance:report:read`).
  - These are bundled into the tenant template `FINANCE_MANAGER`.
  - Cross-organization money visibility is `platform:finance:read`, held only by Super Admin.

## 6. RBAC / Tenant Isolation
- **Implementation:**
  - A typed capability catalogue, synced to the database at boot.
  - A deny-by-default guard; the API refuses to boot if any route lacks a policy (325 routes: 260 capability-gated, 40 authenticated with ownership checks, 25 public).
  - Server-resolved capabilities.
  - Escalation-proof role management.
  - The tenant always comes from the principal.
  - Ownership helpers for every client id; typed DTOs everywhere.
  - Service-layer isolation; RLS deferred with an amended ADR.
- **Tests:** rbac (45), isolation (32), marketplace (11), payments (11), access-policy (2), auth (23), google (8), follow-ups (9), rate-limit (4) — 145 e2e tests; 19 unit tests.
- **Red-team result:**
  - 10 new defects found (RT-001…010) and fixed.
  - 3 follow-up classes closed (SEC-043…045).
  - No known privilege escalation or cross-tenant access remains.

## 7. Backend / API
- **Fixed:**
  - 45 core-audit findings.
  - Error envelope: custom codes are now kept (TENANT_REQUIRED had been dropped), and Prisma errors return 4xx instead of 500.
  - A silent JSON data-loss bug in validation (SEC-040).
  - Dead or misleading code removed: the tenant middleware, the local strategy and the unused RLS helpers.
  - Codex dependencies XT-001, XT-002, XT-004, XT-006, XT-007, XT-008 and XT-009.
  - New endpoints: onboarding, KYC documents, signed document URLs, checkout, `/groups/mine`, `/rbac/roles`, and auth additions.
- **Remaining:**
  - XT-003 (traveler visa status) needs a product decision.
  - XT-005 (preferences) is deferred.
  - Response-envelope consistency and background jobs are in the backlog.

## 8. Database
- **PostgreSQL:**
  - Development and test run on 15; production targets 16 in the KVM stack (restore rehearsed).
  - Isolated databases for this track: `umrah_connects_core` and `umrah_connects_test`.
- **Migrations:**
  - Moved from `db push` to Prisma Migrate. The baseline was proven identical to the live schema (diff exit 0).
  - Two additive migrations: platform role and auth hardening; checkout and Stripe.
  - Applied on the core database, on the test database for every run, and in the container starting from an empty database.
  - The image never migrates on start.
- **Integrity:**
  - Settlement and reconciliation run in one transaction.
  - Server-owned counters are protected by transactional capacity checks.
  - Over-collection is prevented.
  - Backups use custom-format dumps with an integrity listing and checksums; the restore drill and tamper refusal were rehearsed.

## 9. Fake/Mock Runtime Behavior
- **Removed:**
  - The fake "OTP sent" success.
  - The static admin "feature flags".
  - Sandbox payments in production.
  - Reset links returned in responses or written to logs.
  - Kafka enabled by default.
  - The Cloudinary stub.
- **Remaining (frontend, Codex track):**
  - Fabricated landing metrics and KPI deltas.
  - The static "All systems live" badge.
  - Demo tiles that log every persona in as the operator (XT-R04).

## 10. Stripe
- **Implementation:**
  - Official SDK with PaymentIntents, a server-side retrieve/capture step, refunds, customers and cancellation.
  - Every call carries an idempotency key.
  - Amounts come from the server: invoice or booking balance (open intents reserved), or the listing booking total.
  - Traveler checkout pays the provider organization.
- **Webhook:**
  - Signature checked with `constructEvent` against the raw body (300 s tolerance).
  - Events de-duplicated by event id.
  - Amount/currency mismatch → `DISPUTED`; live/test mode mismatch → ignored.
  - Only webhooks or a server-side retrieve can mark a payment paid.
- **Test status:** unit 12 (signatures, mocked client), stripe-mock integration 4, e2e offline-signed webhooks 4, sandbox flows 11.
- **External credential blocker:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` are needed (test first) before a test-mode checkout can be verified.

## 11. Cloudflare R2
- **Implementation:**
  - The repository had no R2 implementation (only stubs). R2 is now implemented as the S3-compatible driver `STORAGE_DRIVER=r2`.
  - A private documents bucket served through presigned GETs (at most 15 min); a public media bucket with a CDN base URL.
  - `local` remains for development, or for production with a persistent volume.
- **Security:**
  - File types come from content sniffing, with a polyglot guard and size limits.
  - Path-safe keys.
  - No static serving of private files.
  - Audited access through signed URLs.
  - KYC storage keys are bound to their organization.
- **Test status:** MinIO integration 5 (sniffed type, checksum, presign, tampered/re-targeted/expired URLs, direct access 403, deletion); e2e local driver.
- **Blocked:** verification against a real R2 bucket needs credentials.

## 12. Infrastructure
- **Vercel readiness:**
  - The contract is documented: rewrite origin, proxy secret and client-IP header, cookies, OAuth redirect, CORS, media domains.
  - The frontend changes are with Codex (XT-R05, XT-R11).
- **Hostinger KVM 8 readiness:**
  - Prepared and rehearsed locally:
    - Non-root, read-only production image with no env files.
    - Compose with PostgreSQL 16 and Caddy (validated).
    - Env validation that fails fast.
    - Deploy/backup/restore/firewall scripts and a systemd timer.
    - Runbook covering the data move from Render.
  - Not provisioned, not deployed.
- **PostgreSQL production readiness:**
  - Containerized with data checksums, reachable only on the internal network and loopback, tuned for KVM 8.
  - Nightly backups with 14 daily and 8 weekly copies and a monthly restore drill.
  - Off-site copy is blocked on credentials.
- **Obsolete service removal:**
  - Render is marked deprecated and kept until cutover (its values were made production-safe).
  - Removed: Cloudinary stub, trycloudflare CORS allowance, 50+ never-read environment variables.
  - Kafka and Redis are classified as not required.

## 13. Tests
- **Typecheck:** `tsc --noEmit` exit 0.
- **Lint:** ESLint flat config (with security rules), 0 problems.
- **Unit:** 19/19.
- **Integration:** providers 11/11 (stripe-mock, MinIO, Mailpit).
- **Security:** e2e 145/145, stable across repeated runs.
- **Build:** `nest build` and `docker build` succeed.
- **Runtime:** QA through the web proxy 65/65; browser check (operator dashboard clean, `/admin` returns 403); container smoke test; KVM rehearsal.

## 14. Red Team
- **Attempts:** vertical and horizontal escalation for all role pairs; JWT tampering and `alg:none`; grant chains; IDOR and cross-tenant linking in every domain; mass assignment; payment and price tampering; webhook forgery and replay; signed-URL abuse; upload bypass; brute force; session replay; Google pre-hijack, state and redirect abuse; enumeration; error leakage.
- **Failures:** RT-001…010, plus follow-ups SEC-043…045 and harness findings SEC-038/040/042.
- **Resolved:** all of them, each with a test.
- **Remaining:** none known. Accepted design risks: service-layer-only isolation (RLS deferred) and an in-memory throttler (single instance).

## 15. Codex Cross-Track Dependencies
- **Resolved:** XT-001, XT-002, XT-004, XT-006, XT-007, XT-008, XT-009.
- **Pending:**
  - XT-003 (product decision) and XT-005 (deferred).
  - Web actions XT-R01…R14. P1: refresh cookie, role routing and guards, private document links, proxy headers and origin, onboarding UI, Stripe Elements, contract changes.

## 16. Release Score
- **Mandatory gates:** 8/8 PASS (security P0/P1 in code, authentication, RBAC, tenant isolation, DB/migration safety, local build/runtime, no known privilege escalation, no known critical data-loss path).
- **Overall verified score:** **76/90 = 84.4**, with 8 BLOCKED (external) and 6 DEFERRED items counted as not passed. The 95 % launch gate is **not met**, and a launch is not recommended until the external blockers and the Codex P1 items are done.

## 17. External Blockers
1. Hostinger KVM 8 access, the DNS record for `api.umrahconnect.io`, and deployment authorization (AUD-001).
2. Cloudflare R2 buckets and an API token.
3. SMTP mailbox credentials (plus SPF/DKIM/DMARC).
4. Stripe test keys, then live keys, and a webhook endpoint.
5. Google OAuth client credentials.
6. An off-site backup target (R2 bucket + rclone remote).
7. The `www.umrahconnect.io` domain in Vercel.
8. The product decision linking traveler accounts to pilgrim records (XT-003).

## 18. Evidence
All paths are relative to the worktree root:
- **Control Tower documents** (`docs/control-tower/`): `FINDINGS_CHECKLIST.md`, `EXECUTION_MATRIX.md`, `SCORECARD.md`, `SECURITY_GATES.md`, `LAUNCH_95_GATE.md`, `RELEASE_EVIDENCE.md`, `RED_TEAM_AUDIT.md`, `DECISIONS.md`, `CROSS_TRACK_REQUESTS.md`, `BLOCKERS.md`, `INFRASTRUCTURE.md`.
- **Evidence files** (`docs/control-tower/evidence/`): `e2e-tests.txt`, `unit-tests.txt`, `provider-integration-tests.txt`, `core-runtime-qa.json`, `api-route-policies.json`, `kvm-rehearsal.md`, `lint.txt`.
- **Test suites** (`platform/api/`): `test/*.e2e-spec.ts`, `test/providers/*.int-spec.ts`, `src/**/*.spec.ts`.
- **Infrastructure:** `infrastructure/kvm/README.md`, `Dockerfile`, `.github/workflows/api-ci.yml`.
- **Architecture record:** `docs/adr/001-multi-tenancy-rls.md` (amendment).

## 19. Remaining P0/P1
- **Code defects:** NONE.
- **External / infrastructure:** AUD-001 (the production API host is down; replacement prepared).
- **Credential-dependent production verification:** AUD-010, AUD-011, AUD-022 (code complete and integration-tested).

## 20. Gate

CLAUDE CORE GATE: PASS
