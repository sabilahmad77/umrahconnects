# Engineering 100 — ready-to-launch

Derived from `ENGINEERING_100_REGISTER.json` by `audit/eng100/register.py render` at 2026-10-01T01:59:38+00:00. Do not edit by hand.

**Launch-readiness score: 155 / 169 = 91.7**

## Mandatory gates

| Gate | Status | Evidence |
|---|---|---|
| G1 no unresolved P0 exposure | **FAIL** | The Render API key exposed in pushed git history is still active (GET /v1/owners → 200, re-checked 2026-10-01). The GitHub token from the same file is invalid (401). Only the owner can revoke the Render key: CREDENTIAL_REMEDIATION.md, PROVIDER_ACTIVATION_CHECKLIST.md step 1. |
| G2 no unresolved P0/P1 security or critical functional defect | **PASS** | Every P0/P1 in ENGINEERING_100_DEFECTS.md is fixed with a regression test (40 defects closed). A12 found none in 31 adversarial API probes and 9 browser probes; A10 found no P0/P1 in 3,329 browser checks. The three open defects are P3 and recorded. |
| G3 authentication and authorization accepted | **PASS** | auth + google-stub + account e2e; capability guards from /auth/me; A10: 1,437/1,437 permission-denied checks correct; A12: capability minting refused in 13 spellings, platform routes refused to every non-platform identity, same-second revocation holds for logout-all, password change, admin force-logout and lock. |
| G4 tenant and Super Admin isolation accepted | **PASS** | Service-layer isolation plus database row-level security (FORCE RLS, non-superuser runtime role). A12 read-swept every GET route × 5 attacker identities × 30 hostile query shapes and blind-wrote every mutating route with another organization’s ids: 0 leaks, victim fingerprint byte-identical. A10: 47/47 cross-tenant probes refused. |
| G5 data and money integrity accepted | **PASS** | payments e2e + hardening + cancellation suites; A12 probes: client-chosen money fields refused, IDOR refused, 4 concurrent captures and 3 replayed webhooks settle once, refunds bounded, a capture after cancellation is held for refund and never revives the booking; per-organization reference sequences; server-side idempotency for creates. |
| G6 critical browser journeys accepted | **PASS** | A10 in actual Chrome: 87/87 routes, 3,329 checks, 3,262 pass, 45/47 complete journeys (2 not completable: Google provider absent, fixture without a group). Runtime acceptance QA re-run on the final build: 211/211. |
| G7 builds and cold boot accepted | **PASS** | API tsc/lint/unit, full e2e 522 passed with nothing skipped, provider suite 12/12, web tsc/eslint/255 tests, nest build + next build + container image build, cold boot from the built artifacts serving health and /login with the API connected as the non-superuser role, migrations with zero drift. |
| G8 provider and operational verification complete for launch | **BLOCKED** | No Google, SMTP, Stripe or R2 credentials and no KVM target exist on this machine; nothing was deployed by instruction. The exact owner steps are in PROVIDER_ACTIVATION_CHECKLIST.md (A11, A13, T04, O03, D06.L, I06, I07, I08.L, N-PRV-1, N-DEP-1, N-OPS-5, D01.L, N-BRD-1). |

## Launch-only rows

| ID | Area | Requirement | Status | Evidence | Verifier |
|---|---|---|---|---|---|
| A11 | Auth | Google Sign-In against real Google credentials | **BLOCKED** | No Google OAuth client exists on this machine; the flow is verified against a local stub only | — |
| A13 | Auth | Production email delivery | **BLOCKED** | No SMTP credentials; mail verified through the log driver and Mailpit only | — |
| D01.L | Database | The baseline migration matches the LIVE production database (verifiable only with access to it, at cutover) | **BLOCKED** | The live production database is the legacy Render instance, which is unreachable (the service times out) and is not part of the target architecture | — |
| D06.L | Database | Off-site R2 bucket + rclone remote configured on the production host; nightly copy observed | **BLOCKED** | rclone remote and off-site bucket cannot be configured without R2 credentials | — |
| T04 | Stripe | Verification in Stripe test mode with real keys | **BLOCKED** | No Stripe keys; the Stripe path is verified against stripe-mock and the sandbox provider | — |
| O03 | Storage | Verification against a real Cloudflare R2 bucket | **BLOCKED** | No R2 credentials; the S3 path is verified against MinIO | — |
| I06 | Infrastructure | Production API reachable (AUD-001) | **BLOCKED** | No Umrah KVM target is identified in the repository and no deployment is authorized in this loop | — |
| I07 | Infrastructure | www certificate (AUD-020) | **BLOCKED** | www.umrahconnect.io still fails TLS (checked this loop) | — |
| I08.L | Infrastructure | Monitoring activated against the production endpoints after cutover | **BLOCKED** | Monitoring is implemented but activates only after cutover | — |
| W40.L | Secrets | Every exposed credential revoked at its provider and confirmed invalid | **BLOCKED** | GitHub PAT: revoked (401 Bad credentials, verified). Render API key: still active (200) at the last check | — |
| N-OPS-5 | Operations | Legacy Render service decommissioned after an authorized KVM cutover (backup first) | **BLOCKED** | The legacy Render service still exists and is not suspended; decommissioning requires a backup and an authorized cutover first | — |
| N-BRD-1 | Brand | Approved standalone Makkah/Kaaba hero asset supplied at apps/web/public/images/hero/makkah-approved.webp | **BLOCKED** | No approved standalone Makkah/Kaaba asset exists anywhere on this machine; the landing page renders its slot only when the file is present | — |
| N-PRV-1 | Payments | Stripe live activation: live keys, production webhook endpoint, account activation | **BLOCKED** | Stripe live activation is a production action outside this loop | — |
| N-DEP-1 | Deployment | Production deployment of the reviewed candidate: Vercel env (API_PROXY_ORIGIN, PROXY_SHARED_SECRET) and KVM API | **BLOCKED** | Nothing was deployed in this loop by instruction | — |
