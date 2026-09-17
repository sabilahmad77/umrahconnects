# Execution Matrix — Claude core track

> **Superseded by INTEGRATION_EXECUTION_MATRIX.md (2026-09-18)**, which scores the
> merged system over a wider denominator. This matrix remains the record for the
> backend track's own 90 items.

Every scored requirement of this loop, with its status and the evidence behind it. Denominator = **all 90 items** (BLOCKED and DEFERRED count as not passed; nothing is excluded). Evidence keys: see FINDINGS_CHECKLIST.md.

| Status | Count |
|---|---|
| PASS | 76 |
| BLOCKED (external credential / access / product decision) | 8 |
| DEFERRED (justified, backlog) | 6 |
| FAIL | 0 |
| **Verified score** | **76/90 = 84.4**  |

Out of scope and not scored: frontend items owned by Codex (AUD-017/018/019/023/027/029/030/031), native mobile (AUD-021), production deployment (not authorized in this loop).

| ID | Area | Requirement | Status | Evidence |
|---|---|---|---|---|
| S01 | Security | Super Admin separated from Operator; /admin platform-only | **PASS** | E rbac; R; B |
| S02 | Security | Role grants cannot escalate or cross organizations | **PASS** | E rbac |
| S03 | Security | Custom roles cannot exceed the creator or carry platform capabilities | **PASS** | E rbac; R |
| S04 | Security | Signup cannot join a chosen organization | **PASS** | E auth; R |
| S05 | Security | Phone OTP cannot create accounts; disabled without SMS | **PASS** | E auth |
| S06 | Security | Deny-by-default route policies enforced at request time and boot | **PASS** | E access-policy; C (boot log) |
| S07 | Security | Hotels/rooms/allotments tenant-isolated | **PASS** | E isolation; R |
| S08 | Security | Transport tenant-isolated incl. seat counters | **PASS** | E isolation |
| S09 | Security | Bookings/pilgrims/finance foreign-id linking blocked | **PASS** | E isolation |
| S10 | Security | Compliance/visa isolation incl. passport data | **PASS** | E isolation |
| S11 | Security | Groups/social/connections ownership & visibility | **PASS** | E isolation |
| S12 | Security | Marketplace listings/bookings/quotes ownership | **PASS** | E marketplace |
| S13 | Security | Marketplace requests discovery & access rules | **PASS** | E marketplace |
| S14 | Security | Sensitive documents private (signed, audited access) | **PASS** | E rbac; R; I (S3 presign) |
| S15 | Security | Upload content validation and size limits | **PASS** | U file-sniff; E; I |
| S16 | Security | Brute-force / abuse throttling | **PASS** | E rate-limit; R |
| S17 | Security | Unauthenticated organization creation closed | **PASS** | E rbac; R |
| S18 | Security | Immediate session revocation (lock, suspend, logout-all, password change) | **PASS** | E auth; E rbac |
| S19 | Security | Mass assignment blocked by typed DTOs | **PASS** | E isolation |
| S20 | Security | CORS allow-list; no wildcard in production | **PASS** | E auth; C |
| S21 | Security | Error hygiene: no stack traces, request ids, stable codes | **PASS** | E auth; C |
| S22 | Security | Security headers (HSTS in prod, CSP, nosniff, frame-deny) | **PASS** | E auth; C |
| S23 | Security | No secrets in repository or image | **PASS** | C (image scan); git ls-files check |
| S24 | Security | Unsafe production configuration refused at start | **PASS** | C |
| S25 | Security | Red-team findings RT-001..RT-010 fixed | **PASS** | E (7 red-team files) |
| S26 | Security | Payment amount tampering impossible | **PASS** | E payments; E follow-ups; R |
| S27 | Security | Client IP trust behind the web proxy | **PASS** | U client-ip (web header pending XT-R05) |
| A01 | Auth | Registration (Traveler, verification mail) | **PASS** | E auth; R |
| A02 | Auth | Login with lockout and generic errors | **PASS** | E auth; R |
| A03 | Auth | Password hashing (bcrypt cost 12) and policy | **PASS** | code; E auth |
| A04 | Auth | Refresh rotation with reuse detection; httpOnly cookie | **PASS** | E auth; R |
| A05 | Auth | Logout and logout-all | **PASS** | E auth |
| A06 | Auth | Password reset single-use; no token leakage | **PASS** | E auth; R |
| A07 | Auth | Email verification | **PASS** | E auth |
| A08 | Auth | Account/organization status enforcement | **PASS** | E auth; E rbac |
| A09 | Auth | Provider onboarding with KYC and platform approval | **PASS** | E rbac |
| A10 | Auth | Google Sign-In (PKCE, state, nonce, linking, ticket exchange) | **PASS** | E google (token endpoint stubbed) |
| A11 | Auth | Google Sign-In against real Google credentials | **BLOCKED** | needs GOOGLE_CLIENT_ID/SECRET |
| A12 | Auth | SMTP delivery code path | **PASS** | I Mailpit |
| A13 | Auth | Production email delivery | **BLOCKED** | needs SMTP credentials |
| R01 | RBAC | Capability catalogue synced; unknown capabilities fail build/boot | **PASS** | tsc; C |
| R02 | RBAC | Eight system roles with capability matrix | **PASS** | E rbac matrix; R |
| R03 | RBAC | Finance as scoped capabilities (D-004) | **PASS** | E follow-ups; R |
| R04 | RBAC | Real accounts for every role (development) | **PASS** | R (9 logins) |
| R05 | RBAC | Database-level RLS defence in depth | **DEFERRED** | D-009, ADR-001 amendment |
| P01 | API | Route inventory with policy per route (325 routes) | **PASS** | evidence/api-route-policies.json |
| P02 | API | Prisma errors mapped to 4xx; custom error codes preserved | **PASS** | E auth |
| P03 | API | Dead/misleading code removed (tenant middleware, local strategy, RLS helpers) | **PASS** | git history |
| P04 | API | Codex backend dependencies XT-001/004/006/007/008/009 | **PASS** | CROSS_TRACK_REQUESTS |
| P05 | API | Traveler group memberships (XT-002) | **PASS** | E follow-ups |
| P06 | API | Traveler visa status (XT-003) | **BLOCKED** | product decision: pilgrim↔user link |
| P07 | API | Persisted user preferences (XT-005) | **DEFERRED** | no model; not launch-critical |
| P08 | API | Consistent response envelope for legacy controllers | **DEFERRED** | LOOPS_BACKLOG |
| D01 | Database | Baseline migration proven identical to live schema | **PASS** | migrate diff exit 0 |
| D02 | Database | Incremental migrations apply on dev, test and empty production DB | **PASS** | C; E global setup |
| D03 | Database | No schema changes on application start | **PASS** | C |
| D04 | Database | RBAC data migration (legacy admins, roleless travelers) | **PASS** | sync-rbac run on core DB |
| D05 | Database | Backups with integrity check and restore drill | **PASS** | C rehearsal |
| D06 | Database | Off-site backup target | **BLOCKED** | needs R2/rclone credentials |
| D07 | Database | Transactional settlement and counter integrity | **PASS** | E payments; E isolation |
| D08 | Database | Seed data realism (AUD-028) | **DEFERRED** | development data only |
| F01 | Fake behaviour | OTP fake success removed | **PASS** | E auth |
| F02 | Fake behaviour | Admin settings no longer fake toggles | **PASS** | code |
| F03 | Fake behaviour | Sandbox gateway impossible in production | **PASS** | C |
| F04 | Fake behaviour | Reset links no longer leaked/logged | **PASS** | E auth |
| T01 | Stripe | Provider on official SDK (intents, capture, refunds, customers, cancel) | **PASS** | I stripe-mock |
| T02 | Stripe | Webhook signature, idempotency, amount/currency and mode checks | **PASS** | U stripe.provider; E follow-ups |
| T03 | Stripe | Server-determined amounts; traveler checkout | **PASS** | E payments |
| T04 | Stripe | Verification in Stripe test mode with real keys | **BLOCKED** | needs STRIPE_* test keys |
| O01 | Storage | Private documents with signed URLs (local driver) | **PASS** | E rbac |
| O02 | Storage | S3-compatible driver (R2 code path) | **PASS** | I MinIO |
| O03 | Storage | Verification against a real Cloudflare R2 bucket | **BLOCKED** | needs R2 credentials |
| O04 | Storage | Orphaned object cleanup job | **DEFERRED** | no job runner (AUD-038) |
| I01 | Infrastructure | Production image (non-root, read-only, no env files) | **PASS** | C |
| I02 | Infrastructure | Compose + Caddy configuration validated | **PASS** | docker compose config; caddy validate |
| I03 | Infrastructure | KVM runbook (prep, deploy, data move, rollback) | **PASS** | infrastructure/kvm/README.md |
| I04 | Infrastructure | Hosting inventory and Render deprecation | **PASS** | INFRASTRUCTURE.md |
| I05 | Infrastructure | CI quality gate defined | **PASS** | api-ci.yml (not yet executed on GitHub) |
| I06 | Infrastructure | Production API reachable (AUD-001) | **BLOCKED** | needs KVM server + DNS; deployment not authorized |
| I07 | Infrastructure | www certificate (AUD-020) | **BLOCKED** | Vercel domain setting |
| I08 | Infrastructure | External uptime monitoring | **DEFERRED** | configure at cutover |
| Q01 | Tests | Typecheck (API) | **PASS** | tsc exit 0 |
| Q02 | Tests | Lint (API) | **PASS** | eslint 0 problems |
| Q03 | Tests | Unit tests | **PASS** | 19/19 |
| Q04 | Tests | E2E security suites | **PASS** | 144/144, stable over 3 runs |
| Q05 | Tests | Provider integration suites | **PASS** | 11/11 |
| Q06 | Tests | Production build (API) and container build | **PASS** | nest build; docker build |
| Q07 | Tests | Runtime QA through the web proxy | **PASS** | 65/65 |
| Q08 | Tests | Browser verification of hardened backend | **PASS** | operator dashboard 200s; /admin 403 |
| X01 | Cross-track | Frontend requests delivered with contracts | **PASS** | CROSS_TRACK_REQUESTS.md |
