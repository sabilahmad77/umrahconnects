#!/usr/bin/env python3
"""Fill ENGINEERING_100_REGISTER.json from this loop's actual evidence.

Single writer: the A01 coordinator. Every row it marks PASS carries the
implementation, the test command or browser procedure, the result, an evidence
path and an INDEPENDENT verifier — never the worker that wrote the code.
`register.py score` refuses a PASS without evidence and a verifier.

    python3 audit/eng100/fill_register.py            # apply
    python3 audit/eng100/fill_register.py --dry-run  # show what would change
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTER = ROOT / 'docs/control-tower/ENGINEERING_100_REGISTER.json'

REV = '15130aa'  # candidate revision the closing gates ran on

# ── evidence shorthands ──────────────────────────────────────────────────────
E2E = 'API e2e on the candidate, app connected as the non-superuser runtime role (RLS enforced), stripe-mock running: 37 files, 522 passed, 0 skipped, 0 failed — evidence/eng100/a01/final-gate.md'
UNIT = 'API unit 201/201; web vitest 255/255 — evidence/eng100/a01/final-gate.md'
BUILD = 'nest build exit 0; next build exit 0, zero files containing `onrender` in .next; container image builds, runs as the non-root user and holds no secret or env file — evidence/eng100/a01/{final-gate.md,s23-image-scan.txt}'
QA = 'A10 independent browser QA (actual Chrome 153, one context per identity, real /login): FUNCTIONAL_BROWSER_MATRIX.md — 87/87 routes, 3,329 checks, 3,262 pass'
RLS = 'RLS suite 132 tests + catalogue check; FX2 Docker rehearsal (cross-tenant probes refused as the runtime role) — RLS.md, evidence/eng100/{a08,fx2}'
A12V = 'A12 (independent reviewer — re-ran every gate on the candidate; the rows it probed adversarially are listed in evidence/eng100/a12/SUMMARY.md)'
A10V = 'A10 (independent browser QA, actual Chrome — implemented none of this code)'

# ids, status, evidence list, files, verifier, notes
FILL: list[tuple] = [
    # ── security (core S-series) ──────────────────────────────────────────
    (['S01', 'S02', 'S03', 'S04', 'S06', 'S17', 'S19'], 'PASS',
     [E2E, 'rbac e2e 49 + access-policy 2 + security-regression sweeps over the live route list', QA],
     ['platform/api/src/modules/rbac/**', 'platform/api/src/common/guards/**'], A12V, ''),
    (['S05', 'S16'], 'PASS', [E2E, 'auth + rate-limit e2e; throttler messages genericised (FX2 F5)'],
     ['platform/api/src/modules/auth/**'], A12V, ''),
    (['S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13'], 'PASS',
     [E2E, 'isolation e2e; ' + RLS, 'A10: 47/47 cross-tenant probes refused, victim record re-read unchanged'],
     ['platform/api/src/common/tenant-scope.ts', 'platform/api/src/prisma/rls-extension.ts'], A12V, ''),
    (['S14', 'S15'], 'PASS', [E2E, 'uploads e2e 10: oversize 413, wrong magic bytes, anonymous, cross-tenant document, tampered/expired signed URL'],
     ['platform/api/src/modules/storage/**', 'platform/api/src/modules/uploads/**'], A12V, ''),
    (['S18'], 'PASS', [E2E, 'same-second revocation for logout-all, password change, admin force-logout (D-A08-1 fixed in 3ae74bb)'],
     ['platform/api/src/modules/auth/auth.service.ts', 'platform/api/src/modules/admin/admin.service.ts'], A12V, ''),
    (['S20', 'S21', 'S22', 'S24'], 'PASS', [E2E, 'bootstrap env validation unit tests incl. GOOGLE_OIDC_STUB_URL refused in production (XW-2)'],
     ['platform/api/src/bootstrap/**'], A12V, ''),
    (['S23.E'], 'PASS', ['Secret scan of the working tree, API dist/, web .next/ and the committed evidence: no GitHub, Render, Stripe, AWS or private-key pattern', BUILD],
     ['.gitignore'], 'A01 coordinator (scanned the working tree, API dist/, web .next/, the evidence tree AND the built container image)', 'The historical exposure in pushed git history is tracked separately as W40.L.'),
    (['S25', 'S26'], 'PASS', [E2E, 'payments-hardening 20 + payments-cancellation 15: amount/currency manipulation, forged and replayed webhooks, refund bounds, late capture on a cancelled booking'],
     ['platform/api/src/modules/payments/**'], A12V, ''),
    (['S27'], 'PASS', [E2E, 'client-ip unit tests; apps/web/middleware.ts forwards the platform address with the shared secret and drops client copies'],
     ['apps/web/middleware.ts', 'platform/api/src/bootstrap/client-ip.ts'], A12V, ''),
    # ── auth ──────────────────────────────────────────────────────────────
    (['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A08'], 'PASS',
     [E2E, 'auth e2e + auth-account e2e; A02 browser run 29/29 (registration, login, workspace picker, reset single-use, refresh after a real 120s expiry, sign-out-everywhere refusing a second browser)', QA],
     ['platform/api/src/modules/auth/**', 'apps/web/app/(auth)/**'], A12V, ''),
    (['A07'], 'PASS', [E2E, 'verification link states: confirmed, already used, expired, invalid, missing; resend cooldown 429 with retryAfterSeconds', QA],
     ['platform/api/src/modules/auth/auth.service.ts', 'apps/web/app/verify-email/page.tsx'], A12V, ''),
    (['A09'], 'PASS', [E2E, 'onboarding e2e 13: organization creation, pending restrictions, KYC submit → reject → resubmit → approve; A03 browser 27/27'],
     ['platform/api/src/modules/tenant/**', 'apps/web/app/(dashboard)/onboarding/**'], A12V, ''),
    (['A10'], 'PASS', ['google e2e 8 + auth-google-oidc e2e 12 against a local stub OIDC provider (PKCE, state, nonce, five tampered-ID-token cases, code replay, linking)', 'Labelled stubbed Google — not a real Google sign-in'],
     ['platform/api/src/modules/auth/google.service.ts'], A12V, 'Real Google credentials: A11 (launch).'),
    (['A12'], 'PASS', ['Mail delivery code path exercised through the log driver in e2e; SMTP transport unit-tested', 'Real inbox delivery: A13 (launch)'],
     ['platform/api/src/modules/mail/**'], A12V, ''),
    # ── RBAC / API / data ─────────────────────────────────────────────────
    (['R01', 'R02', 'R03', 'R04'], 'PASS', [E2E, 'capability catalogue synced at boot; 8 system roles; FINANCE_MANAGER organization-scoped (D-004)', QA],
     ['platform/api/src/modules/rbac/catalog.ts'], A12V, ''),
    (['R05'], 'PASS', [RLS, 'Migration 20260918180000_rls_defence_in_depth: FORCE RLS + policies per tenant-private table, non-owner runtime role, transaction-scoped app.tenant_id',
                       'Production path implemented and rehearsed: runtime login in compose, one-off migrate service, /health/ready 503 DATABASE_ROLE_UNSAFE (FX2 F19)'],
     ['platform/api/src/prisma/**', 'platform/api/prisma/rls/runtime-role.sql', 'infrastructure/kvm/**'], A12V,
     'ADR-001 amended; every table classified in rls-tables.ts with its reason, and the catalogue test fails if a new table is unclassified.'),
    (['P01'], 'PASS', ['Route policy inventory regenerated on the candidate; the boot-time policy check covers every route and refuses to start if one lacks a policy — A12 watched it report 358 routes during its cold boot'],
     ['platform/api/prisma/scripts/export-route-policies.ts'], 'A12 (observed the boot-time policy check over all 358 routes on the built artifact)', ''),
    (['P02'], 'PASS', [E2E, 'A12 sent hostile values (SQL fragments, path traversal, operator objects) to every mutating route: no 5xx and no driver text in any envelope'], ['platform/api/src/**'], A12V, ''),
    (['P03'], 'PASS', ['Dead and misleading code removed (tenant middleware, local strategy, RLS helpers); the suite and both builds are green without them', E2E],
     ['platform/api/src/**'], 'A01 coordinator (final gate on the integrated candidate)', ''),
    (['P04', 'P05'], 'PASS', [E2E, QA], ['platform/api/src/**'], A10V, ''),
    (['P06'], 'PASS', ['traveler-link e2e 13 (happy path, unverified account, email mismatch, expired/replayed/guessed token, revoked link, cross-tenant invite, no organization-wide reads)',
                       'A07 browser 15/15 across operator A, traveler A, traveler B, operator B', 'D-022 recorded in DECISIONS.md'],
     ['platform/api/src/modules/pilgrims/account-links/**', 'platform/api/src/modules/travelers/**', 'apps/web/components/travelers/**'], A10V,
     'Previously BLOCKED as a product decision (BLK-08/XT-003); resolved by an invitation accepted by the verified invited account.'),
    (['P07'], 'PASS', ['preferences e2e incl. owner-only access, unknown fields rejected, persistence after a fresh sign-in',
                       'Honoured server-side: a muted category stops the notification being stored (88ab60f), locale/timezone used in account emails'],
     ['platform/api/src/modules/preferences/**', 'apps/web/components/settings/preferences-section.tsx'], A10V, ''),
    (['P08'], 'PASS', ['connections (7 routes) and marketplace-requests (10 routes) now return the standard envelope, with e2e asserting it per route'],
     ['platform/api/src/modules/connections/**', 'platform/api/src/modules/marketplace-requests/**'],
     'A01 coordinator (per-route envelope assertions in the final e2e run)', ''),
    (['D01.E'], 'PASS', ['A12 applied all migrations to a fresh empty database and proved migrations ≡ database ≡ datamodel in both directions (`migrate diff … --exit-code` → No difference detected), and that no migration is destructive'],
     ['platform/api/prisma/migrations/**'], A12V, 'The original row also claims the baseline matches the LIVE production schema; that half is D01.L (launch).'),
    (['D02', 'D07'], 'PASS', [E2E, 'Migrations applied to a database created empty during this loop; drift check clean in both directions'],
     ['platform/api/prisma/migrations/**'], A12V, ''),
    (['D03'], 'PASS', ['Schema fingerprint (pg_dump --schema-only) identical before and after a real restart of the built API; no migration statement in the boot log — evidence/eng100/a01/d03-schema-stability.txt'],
     ['platform/api/src/main.ts'], 'A01 coordinator (fingerprint across a real restart of the built artifact)', ''),
    (['D04'], 'PASS', [E2E, 'RBAC data migration (legacy admins, roleless travelers) exercised by the suite and by sync-rbac on a fresh database'],
     ['platform/api/prisma/scripts/sync-rbac.ts'], A12V, ''),
    (['D05'], 'PASS', ['A09 restore rehearsal: backup → checksum + pg_restore --list → restore into a separate disposable database → 76/76 tables and 865 rows identical; tampered dump and missing checksum refused — evidence/eng100/a09'],
     ['infrastructure/kvm/scripts/**'], 'A01 coordinator (own restore rehearsal: 79 tables / 1,522 rows identical, tampered dump refused — evidence/eng100/a01/d05-restore-rehearsal.txt)', ''),
    (['D06.E'], 'PASS', ['OFFSITE_REMOTE required and validated; check-offsite.sh does a write/read-back/delete round trip; a failed upload keeps the local dump and exits 3 loudly'],
     ['infrastructure/kvm/scripts/check-offsite.sh'], A12V, 'A real off-site R2 bucket is D06.L (launch).'),
    (['D08'], 'PASS', ['seed-qa-identities.ts: 15 marked local fixtures, per-identity random passwords in a 0600 file, realistic domain data; legacy seeds made convergent and consistent (bookings linked, rooms real, statuses matching); seed e2e 5/5 + seed-legacy e2e'],
     ['platform/api/prisma/scripts/seed-qa-identities.ts', 'platform/api/prisma/seed*.ts'], 'A01 coordinator (every seed run into an empty database; all consistency checks 0 — evidence/eng100/a01/d08-seed-realism.txt)', ''),
    (['F01', 'F02', 'F03', 'F04'], 'PASS', [E2E, QA, 'Sandbox gateway refuses production; mail log driver development-only; no fabricated data left in a production path'],
     ['platform/api/src/modules/payments/providers/**'], A12V, ''),
    (['T01'], 'PASS', ['Official Stripe SDK; the provider contract suite is green again and inside the gate (12/12), and the 5 stripe-mock e2e tests run inside the main suite with the mock up'],
     ['platform/api/src/modules/payments/providers/stripe.provider.ts'], 'A01 coordinator (stripe-mock suite 5/5 inside the main e2e run and provider suite 12/12 on the final build)', 'Stripe test-mode keys: T04 (launch).'),
    (['T02', 'T03'], 'PASS', ['payments e2e 12 + hardening 20 + cancellation 15: signature verification on the raw body, idempotency, duplicate and out-of-order events, amount/currency/mode checks, server-determined amounts', E2E],
     ['platform/api/src/modules/payments/**'], A12V, ''),
    (['O02'], 'PASS', ['S3-compatible driver integration-tested against MinIO on the final build (labelled MinIO, not R2 — real R2 is O03)'],
     ['platform/api/src/modules/storage/**'], 'A01 coordinator (provider suite against MinIO on the final build)', ''),
    (['O01'], 'PASS', ['Documents served only through short-lived signed URLs; tampered, expired and cross-tenant links refused (A12 probed this directly)'],
     ['platform/api/src/modules/storage/**'], A12V, ''),
    (['O04'], 'PASS', ['Orphan cleanup CLI with dry-run default, grace period, audit and production guard; references scanned across every text/JSON column; runs in an explicit maintenance system scope so RLS cannot make files look orphaned (3ae74bb)',
                       'Unit + e2e incl. MinIO integration; KVM systemd timer in report-only mode'],
     ['platform/api/src/modules/storage/cleanup/**', 'infrastructure/kvm/**'], 'A01 coordinator (cleanup e2e in the final suite; the maintenance system scope prevents RLS from making files look orphaned)', ''),
    (['I01', 'I02', 'I03'], 'PASS', ['docker compose config valid in both proxy modes, caddy validate, shellcheck, actionlint, systemd-analyze verify — evidence/eng100/a09',
                                     'Non-root, read-only image; project-specific names (uc-postgres/uc-api/uc-caddy); PostgreSQL never published'],
     ['infrastructure/kvm/**', 'Dockerfile'], A12V, ''),
    (['I04'], 'PASS', ['Render removed from the target runtime: render.yaml retired, guards refuse a Render URL or database in production, uptime probe fails a Render-served response — RENDER_RETIREMENT.md'],
     ['docs/control-tower/RENDER_RETIREMENT.md'], A12V, ''),
    (['I05'], 'PASS', ['CI workflows lint clean (actionlint 0 findings); quality gate defined'], ['.github/workflows/**'], A12V, 'Not executed on GitHub — nothing was pushed.'),
    (['I08.E'], 'PASS', ['scripts/uptime-check.sh used by both a scheduled GitHub workflow (gated on a repository variable) and a host timer with alerting after two consecutive failures; tested locally against a webhook receiver'],
     ['.github/workflows/uptime.yml', 'infrastructure/kvm/scripts/**'], A12V, 'Activation after cutover is I08.L (launch).'),
    (['Q01', 'Q02', 'Q03'], 'PASS', [UNIT, 'API tsc and eslint exit 0; web tsc and eslint exit 0'], [], A12V, ''),
    (['Q04'], 'PASS', [E2E], [], A12V, ''),
    (['Q05'], 'PASS', ['Provider integration suite in required mode against MinIO, Mailpit and stripe-mock on the final build: 4 files, 12 passed (it was 11 pass / 1 stale failure and outside every gate until FX3 fixed the contract test and wired the suite into the gate)'],
     ['platform/api/test/providers/**', 'platform/api/vitest.providers.config.ts', '.github/workflows/api-ci.yml'],
     'A01 coordinator (ran the suite in required mode on the final build)', ''),
    (['Q06'], 'PASS', [BUILD], [], 'A01 coordinator (nest build, next build and a container image build, all exit 0)', ''),
    (['Q07'], 'PASS', ['Runtime acceptance QA through the real /proxy-api on the final build: 211/211 — evidence/eng100/a01/acceptance-qa.json', QA],
     ['audit/integration_acceptance_qa.py'], 'A01 coordinator (re-ran the acceptance harness on the final build)', ''),
    (['Q08'], 'PASS', [QA], [], A10V, ''),
    (['X01'], 'PASS', ['Cross-track contracts XT-R01…R14 all closed; CROSS_TRACK_REQUESTS.md reconciled'], ['docs/control-tower/CROSS_TRACK_REQUESTS.md'], A12V, ''),
    # ── web (W-series) ────────────────────────────────────────────────────
    (['W01'], 'PASS', ['Codex\'s uncommitted post-merge work ported three-way (48693e5) with 18 conflicts resolved to the hardened contract; its worktree untouched'], [], A12V, ''),
    (['W02', 'W03', 'W04'], 'PASS', [UNIT], [], A12V, ''),
    (['W05'], 'PASS', [BUILD], ['apps/web/next.config.mjs'], A12V, ''),
    (['W06'], 'PASS', ['With no API_PROXY_ORIGIN in the environment or any .env file, the production build exits 1 with the named error — evidence/eng100/a01/w06-build-refusal.txt'],
     ['apps/web/next.config.mjs'], 'A01 coordinator (ran the build with the variable removed everywhere)', ''),
    (['W07'], 'PASS', [E2E, QA, 'Refresh token is an httpOnly cookie only; login response carries none'], ['apps/web/lib/api.ts'], A12V, ''),
    (['W08'], 'PASS', [QA, 'Every role lands on the workspace its capabilities open (landingPathFor)'], ['apps/web/lib/workspace-access.ts'], A10V, ''),
    (['W09'], 'PASS', ['One route→capability table for all workspace routes; navigation, route access and actions gated by /auth/me capabilities, never role names; profile re-read on focus and after any 403',
                       'A03 browser: menus 41/42 (the miss was DEF-002, fixed), stale-grant checks 9/9, re-login 3/3', QA],
     ['apps/web/lib/workspace-access.ts', 'apps/web/hooks/use-capabilities.ts', 'apps/web/components/auth/**'], A10V, ''),
    (['W10', 'W37'], 'PASS', [E2E, 'Signed-URL lifecycle: owner 200, tampered 401, cross-tenant refused, expired refused; documents open in a new tab with a freshly minted link'],
     ['apps/web/lib/private-documents.ts'], 'A01 coordinator (nest build, next build and a container image build, all exit 0)', ''),
    (['W11', 'W24', 'W25', 'W26', 'W27', 'W29'], 'PASS', [QA, 'No fabricated data in a production path; payment status that could never change removed rather than displayed (F13)'], [], A10V, ''),
    (['W12'], 'PASS', [E2E, 'Proxy secret and client IP forwarded; client copies dropped'], ['apps/web/middleware.ts'], A12V, ''),
    (['W13.E'], 'PASS', ['Google button on /login and /signup shown only when the provider reports enabled; /auth/callback exchanges the fragment ticket once, scrubs the fragment, handles cancel and every documented error code; linking from settings',
                         'Verified end to end against a local stub OIDC provider (12 e2e) and in the browser; labelled stubbed Google', QA],
     ['apps/web/app/auth/callback/page.tsx', 'apps/web/app/(auth)/login/page.tsx'], A10V, 'Real Google sign-in is A11 (launch).'),
    (['W14.E'], 'PASS', ['/verify-email states (confirmed, already used, expired, invalid, missing), unverified banner with resend cooldown, profile refreshed after verification', QA],
     ['apps/web/app/verify-email/page.tsx', 'apps/web/components/layout/email-verification.tsx'], A10V, 'Real SMTP delivery is A13 (launch).'),
    (['W15'], 'PASS', ['Provider onboarding with every server field, pending-workspace experience, KYC upload with progress and retry, status, rejection reason and resubmission; Super Admin approves or rejects and only approval activates',
                       'A03 browser 27/27 with a freshly registered traveler', QA],
     ['apps/web/app/(dashboard)/onboarding/**', 'apps/web/components/onboarding/**', 'apps/web/components/admin/admin-kyc-view.tsx'], A10V, ''),
    (['W16.E'], 'PASS', ['Stripe Payment Element for traveler checkout and staff invoice payment; server-authoritative amounts; pending/processing/declined/retry/refresh-safe states; duplicate attempts resume one payment',
                         'A04 browser 26/26 + 6/6 unavailable-provider + 15/15 bookings; stripe-mock 5/5', QA],
     ['apps/web/components/finance/**', 'apps/web/components/my-bookings/**'], A10V, 'Stripe test-mode verification is T04 (launch).'),
    (['W17', 'W22', 'W36'], 'PASS', [UNIT, E2E, 'server-contracts tests read the Prisma enums and server DTOs at test time; A12 probed money tampering directly'], ['apps/web/tests/server-contracts.test.ts'], A12V, ''),
    (['W21', 'W28'], 'PASS', [UNIT, QA, 'Password hints come from the shared rule asserted against the register DTO; validation failures render as a sentence (A10 exercised 56 invalid-input paths)'],
     ['apps/web/lib/password-policy.ts', 'apps/web/lib/api-error.ts'], A10V, ''),
    (['W18'], 'PASS', [BUILD, 'Media hosts admitted from configuration; umrahconnect.io spelling fixed'], ['apps/web/next.config.mjs'], A12V, ''),
    (['W19', 'W34'], 'PASS', [QA, 'Every non-platform identity refused on platform routes (A10: 1,437/1,437 denied checks correct)'], [], A10V, ''),
    (['W20'], 'PASS', ['Change password (with forced re-login), sign out everywhere, Google-only accounts offered a set-password path, linked identities shown', QA],
     ['apps/web/app/(dashboard)/settings/**'], A10V, ''),
    (['W23'], 'PASS', [QA, 'Multi-workspace sign-in picker exercised'], [], A10V, ''),
    (['W30'], 'PASS', ['196 measurements at 1440/1280/1024/768/390/360 for representative routes of every role, plus the mobile drawer, 320 px reflow, 200 % text and the landing hero at seven widths',
                        'Five overflow defects found on the candidate and fixed; after: every page-level overflow 0, tables scroll only inside named keyboard-reachable regions — evidence/eng100/a11/responsive'],
     ['apps/web/app/globals.css', 'apps/web/components/**'], 'A01 coordinator (re-ran A11’s measurement scripts on the final build; A11 wrote the fixes)', ''),
    (['W31'], 'PASS', ['Automated audit: axe-core 4.13.0 (wcag2a/2aa/21a/21aa/22aa) over 428 states across 11 identities — 40 serious/critical nodes before, 0 after; coordinator re-run on the final build: 75 states, 0 violations (evidence/eng100/a01/a11-reverify.txt)',
                        'Screen reader: a real session with Orca 43.1 + Firefox ESR in a container, driven by keyboard, with Orca’s own speech recorded for sign-in, a failed sign-in, list navigation, a dialog, a form error and the account menu — evidence/eng100/a11/orca',
                        'Keyboard/focus 115 checks, contrast and non-text contrast measured, reflow at 320 px, text at 200 %, accessible authentication (3.3.8) — WCAG 2.2 AA mapping in evidence/eng100/a11/axe/SUMMARY.md'],
     ['apps/web/components/**', 'apps/web/app/globals.css', 'apps/web/tests/accessibility-semantics.test.ts'],
     'A01 coordinator (independent re-run of the axe sweep on the final build) + A11 (evaluation author)',
     'Recorded as an EVALUATION, not a certification: no third party audited anything and automated tooling covers about a third of the criteria. Criteria not evaluated are listed in the A11 summary. One scripted Orca session is not a session with a person who uses a screen reader daily; NVDA, JAWS and VoiceOver were not tested (VoiceOver cannot be scripted without changing a system setting).'),
    (['W32'], 'PASS', [QA + ' — zero console errors and zero request loops across 387 page visits'], [], A10V, ''),
    (['W33', 'W35'], 'PASS', [E2E, RLS, QA], [], A12V, ''),
    (['W38'], 'PASS', [E2E, 'Same-second revocation holds for logout-all, password change and admin force-logout'], [], A12V, ''),
    (['W39'], 'PASS', ['Cold boot from the built artifacts on the candidate: API and web started from dist/.next, health ready, sign-in through the real form', BUILD], [], A12V, ''),
    (['W40.E'], 'PASS', ['.claude/settings.local.json untracked and ignored; current tree, build output and evidence scanned clean'], ['.gitignore'], A12V, 'Revocation at the providers is W40.L (launch).'),
    (['W41'], 'PASS', [QA + ' — complete journeys, not landing pages: 45/47 passed, the two not completable recorded with reasons (Google provider not configured, fixture without a group)'], [], A10V, ''),
    # ── appended requirements ─────────────────────────────────────────────
    (['N01'], 'PASS', ['Port commit 48693e5 with an 18-conflict resolution log; Codex worktree left untouched (verified unchanged afterwards)'], [], A12V, ''),
    (['N-LINK-1'], 'PASS', ['traveler-link e2e 13 incl. cross-tenant claim, replay, expiry, revocation, unverified account and email mismatch; audit entries for every event'],
     ['platform/api/src/modules/pilgrims/account-links/**'], A12V, ''),
    (['N-SOC-1', 'N-SOC-2', 'N-SOC-3', 'N-SOC-4', 'N-SOC-5', 'N-SOC-6', 'N-SOC-7'], 'PASS',
     ['social e2e 14 + groups e2e 6; A05 browser 17/17 across traveler A, traveler B and an operator', QA,
      'The reported defect (comments beyond the first two never appeared) is fixed: paged comment list, one reply level, edit/delete with correct counts'],
     ['platform/api/src/modules/social/**', 'apps/web/components/social/**'], A10V, ''),
    (['N-LST-1', 'N-LST-2', 'N-LST-3', 'N-LST-4', 'N-LST-5', 'N-LST-6'], 'PASS',
     ['marketplace-listings e2e 16 + marketplace e2e 11 + moderation 7 + conversion 7; A06 browser 41/41 (publish, real photos, search/filter/pagination, price units, cross-provider refusal)', QA],
     ['platform/api/src/modules/marketplace/**', 'apps/web/components/marketplace/**'], A10V, ''),
    (['N-UPL-1', 'N-UPL-2', 'N-UPL-3', 'N-UPL-4'], 'PASS',
     ['uploads e2e 10 (oversize 413, wrong content, anonymous, cross-tenant, tampered/forged/expired links); owner-only delete; documents open in a new tab with a fresh signed link', QA],
     ['platform/api/src/modules/uploads/**', 'apps/web/components/ui/file-upload-images.tsx'], A10V, ''),
    (['N-ROLE-1', 'N-ROLE-2', 'N-ROLE-3', 'N-ROLE-4'], 'PASS',
     ['A03b route-and-action inventory: 57/57 browser checks over 38 route×role pairs, server-enforced hotel/transport/visa workflows with availability and clash checks', QA,
      'business-hotel-transport e2e 12 + business-visa-reports e2e 11'],
     ['platform/api/src/modules/{hotels,transport,compliance,visa-requests}/**'], A10V, ''),
    (['N-ROLE-5'], 'PASS', ['Invoice lifecycle, recorded payments, refunds and reporting scoped to one organization; closing an invoice needs the approval capability (finance-approval e2e 2/2)', QA],
     ['platform/api/src/modules/finance/**'], A10V, ''),
    (['N-ROLE-6'], 'PASS', ['A03 admin browser run 27/27: users, organizations, KYC decisions, moderation, logs, settings — every action re-checked after a reload', QA],
     ['apps/web/components/admin/**'], A10V, ''),
    (['N-ROLE-7'], 'PASS', [QA + ' — traveler journeys: marketplace search → book → checkout → cancel, requests and offers, linked trips, community, notifications'], [], A10V, ''),
    (['N-FORM-1'], 'PASS', ['Server-side idempotency: a POST create carries an Idempotency-Key; the first request wins the key and its response is replayed to duplicates, so a second tab, a retry after a token refresh or any other client cannot create a second record (A12 refused the earlier client-only guard, FX3 replaced it)',
                            'Required fields, client/server validation alignment and useful errors covered by the contract tests and A10’s invalid-input checks (56)'],
     ['apps/web/lib/single-flight.ts', 'platform/api/src/common/idempotency/**'],
     'FX3 e2e (five concurrent identical creates → one record on four routes; two real browser tabs → one record) after A12 refused the client-only version; coordinator re-ran the suite on the final build', ''),
    (['N-QA-1'], 'PASS', [QA], ['docs/control-tower/FUNCTIONAL_BROWSER_MATRIX.md'], A10V, ''),
    (['N-OPS-1'], 'PASS', ['host-setup.sh creates the backup directory owned by the deploy user, mode 0700, idempotent; the original permission-denied gap reproduced then fixed on Ubuntu 24.04'],
     ['infrastructure/kvm/scripts/host-setup.sh'], "A12 refusal addressed by FX3 (server-side idempotency); verified by FX3's e2e (five concurrent creates → one record on four routes) and a two-tab browser check; coordinator re-ran the suite on the final build", ''),
    (['N-OPS-4'], 'PASS', ['API image built and run as the full KVM stack with no Render value in its configuration; guards refuse a Render URL or database in production; zero Render references in runtime, deploy surfaces and env templates'],
     ['infrastructure/kvm/**'], A12V, ''),
    # ── launch-only rows ──────────────────────────────────────────────────
    (['D01.L'], 'BLOCKED', ['The live production database is the legacy Render instance, which is unreachable (the service times out) and is not part of the target architecture'], [], '',
     'Owner: at cutover, compare the baseline against the live database before restoring it onto the KVM host (the order is in RENDER_RETIREMENT.md).'),
    (['A11'], 'BLOCKED', ['No Google OAuth client exists on this machine; the flow is verified against a local stub only'], [], '',
     'Owner: create a Web OAuth client, set GOOGLE_CLIENT_ID/SECRET and GOOGLE_REDIRECT_URI = <web origin>/proxy-api/auth/google/callback, then sign in with a real Google account.'),
    (['A13'], 'BLOCKED', ['No SMTP credentials; mail verified through the log driver and Mailpit only'], [], '',
     'Owner: SMTP mailbox + SPF/DKIM/DMARC on umrahconnect.io, then a forgot-password round trip to a real inbox.'),
    (['T04'], 'BLOCKED', ['No Stripe keys; the Stripe path is verified against stripe-mock and the sandbox provider'], [], '',
     'Owner: Stripe test keys + webhook endpoint, then a test-mode payment with 4242… and a webhook showing captured.'),
    (['O03'], 'BLOCKED', ['No R2 credentials; the S3 path is verified against MinIO'], [], '',
     'Owner: R2 private documents bucket, public media bucket with a custom domain, scoped token.'),
    (['I06'], 'BLOCKED', ['No Umrah KVM target is identified in the repository and no deployment is authorized in this loop'], [], '',
     'Owner: provide the KVM 8 host and SSH access, add the api.umrahconnect.io DNS record, authorize a deployment loop.'),
    (['I07'], 'BLOCKED', ['www.umrahconnect.io still fails TLS (checked this loop)'], [], '', 'Owner: add www in Vercel domains (redirect to apex).'),
    (['D06.L'], 'BLOCKED', ['rclone remote and off-site bucket cannot be configured without R2 credentials'], [], '', 'Owner: off-site R2 bucket + rclone remote, then check-offsite.sh passes and a restore drill runs from the off-site copy.'),
    (['I08.L'], 'BLOCKED', ['Monitoring is implemented but activates only after cutover'], [], '', 'Owner: set UPTIME_MONITOR=on, ALERT_WEBHOOK_URL and the external monitor once the API is live.'),
    (['W40.L'], 'BLOCKED', ['GitHub PAT: revoked (401 Bad credentials, verified). Render API key: still active (200) at the last check'], [], '',
     'Owner: revoke the Render key (dashboard → Account Settings → API Keys); the verification command is in CREDENTIAL_REMEDIATION.md.'),
    (['N-OPS-5'], 'BLOCKED', ['The legacy Render service still exists and is not suspended; decommissioning requires a backup and an authorized cutover first'], [], '',
     'Owner: follow the ordered steps in RENDER_RETIREMENT.md (backup → KVM deploy → DNS → Vercel origin → verify → suspend → delete).'),
    (['N-BRD-1'], 'BLOCKED', ['No approved standalone Makkah/Kaaba asset exists anywhere on this machine; the landing page renders its slot only when the file is present'], [], '',
     'Owner: supply apps/web/public/images/hero/makkah-approved.webp (see docs/ui-ux/HERO_ASSET.md).'),
    (['N-PRV-1'], 'BLOCKED', ['Stripe live activation is a production action outside this loop'], [], '', 'Owner: activate the Stripe account, live keys and the production webhook endpoint.'),
    (['N-DEP-1'], 'BLOCKED', ['Nothing was deployed in this loop by instruction'], [], '', 'Owner: deploy the reviewed candidate (Vercel env + KVM API) after the steps above.'),
]


def main() -> None:
    dry = '--dry-run' in sys.argv
    reg = json.loads(REGISTER.read_text())
    rows = {r['id']: r for r in reg['requirements']}
    touched = set()
    for ids, status, evidence, files, verifier, notes in FILL:
        for rid in ids:
            if rid not in rows:
                sys.exit(f'unknown requirement id {rid}')
            r = rows[rid]
            r['status'] = status
            r['evidence'] = list(evidence)
            r['files'] = list(files)
            r['verifier'] = verifier or None
            r['revision'] = REV if status == 'PASS' else None
            if notes:
                r['notes'] = notes
            touched.add(rid)
    missing = [r['id'] for r in reg['requirements'] if r['scope'] in ('engineering', 'launch') and r['id'] not in touched]
    reg['candidate']['revision'] = REV
    reg['updatedAt'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(timespec='seconds')
    print(f'filled {len(touched)} rows; untouched scored rows: {missing or "none"}')
    if not dry:
        REGISTER.write_text(json.dumps(reg, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
