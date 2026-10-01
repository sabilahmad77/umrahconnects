# Mandatory security & safety gates

Pass/fail, no partial credit. The overall score only matters once all of them pass.
Re-verified on `integration/web-final` (the merged backend + frontend), not inherited.

| Gate | Result | Evidence |
|---|---|---|
| Security P0/P1 (code) = 100 % | **PASS** | Every P0/P1 code finding from the core audit and red team is verified closed. One new P1 was found and fixed in this loop: sign-out-everywhere did not revoke a token minted in the same wall-clock second (FINDINGS_CHECKLIST INT-001). |
| Authentication critical path = 100 % | **PASS** | auth e2e 24, google e2e 8; runtime QA signup/login/lockout/refresh/logout/reset; acceptance: session revocation, token tampering, `alg:none`, login enumeration parity |
| RBAC critical path = 100 % | **PASS** | rbac e2e 45, access-policy 2; runtime QA capability matrix; acceptance: 63 direct platform-route probes across nine identities |
| Tenant isolation = 100 % | **PASS** | isolation e2e 32, marketplace 11, payments 11; acceptance: A/B organizations for hotel, transport, visa, operator and traveler — read, update, delete, decide, list-leak and document access all refused |
| Super Admin isolation = 100 % | **PASS** | every non-platform identity refused on `/admin/*` and `/inquiries` by direct API call, not navigation; Super Admin itself has no tenant business access |
| Database / migration safety = 100 % | **PASS** | migrations applied to a freshly created database this loop; no schema change on start; soft delete proven to persist; backup/restore rehearsal carried from the core track |
| Local build / runtime = 100 % | **PASS** | API tsc + eslint clean, web tsc + eslint clean, unit 19/19, API e2e 146/146, web 58/58, `nest build` and `next build` both succeed, cold boot passes the full smoke |
| No known privilege escalation | **PASS** | none open. Tested: platform-capability role creation, SUPER_ADMIN assignment, signup role/organization injection, JWT claim tampering, `alg:none`, cross-tenant confirm/refund |
| No known critical data-loss path | **PASS** | server-owned counters and totals refuse client values; payment state is provider-owned; removal is a soft delete that stays visible to its owner and hidden from everyone else |

Result on the web-integration branch (2026-09-18): all nine gates PASS.

## Engineering 100 loop result (2026-10-01, candidate `15130aa`)

Re-verified on the integrated candidate, with an independent reviewer (A12) and an
independent browser QA worker (A10) — neither wrote the code they checked.

| Gate | Result | Evidence |
|---|---|---|
| G1 no unresolved P0 exposure | **FAIL** | The Render API key in pushed history is still active (200 on 2026-10-01). The GitHub token is invalid (401). Owner action: PROVIDER_ACTIVATION_CHECKLIST.md step 1. |
| G2 no unresolved P0/P1 defect | **PASS** | 40 defects fixed with regression tests; A12's 31 adversarial API probes and 9 browser probes found none; A10 found none in 3,329 checks. Three P3 items remain, recorded. |
| G3 authentication and authorization | **PASS** | auth/Google-stub/account e2e; capability guards from `/auth/me`; 1,437/1,437 denied-state checks; capability minting refused in 13 spellings; same-second revocation for logout-all, password change, admin force-logout and lock. |
| G4 tenant and Super Admin isolation | **PASS** | Service layer plus FORCE RLS as a non-superuser role; A12's read sweep (every GET route × 5 attackers × 30 hostile query shapes) and blind write sweep: 0 leaks, victim fingerprint identical; 47/47 cross-tenant browser probes refused. |
| G5 data and money integrity | **PASS** | Payments suites plus A12 probes: client money fields refused, IDOR refused, concurrent captures and replayed webhooks settle once, refunds bounded, a capture after cancellation is held for refund. |
| G6 critical browser journeys | **PASS** | 87/87 routes, 45/47 complete journeys in actual Chrome; runtime acceptance QA 211/211 on the final build. |
| G7 builds and cold boot | **PASS** | 522 e2e with nothing skipped, provider suite 12/12, both builds and a container image, cold boot from the built artifacts, migrations with zero drift. |
| G8 provider and operational verification for launch | **BLOCKED** | No Google, SMTP, Stripe or R2 credentials and no KVM target exist here; nothing was deployed by instruction. |

A failed or blocked gate is not averaged away: the launch verdict is **BLOCKED**
regardless of the 91.7 score, and engineering acceptance stands on G2–G7.

These gates are about the code. They do not cover the one open security item that
is not a code defect: two credential-shaped tokens are present in pushed git
history (`.claude/settings.local.json`). The file is now untracked and ignored,
but only revocation at GitHub and Render closes the exposure. See BLOCKERS.md
BLK-09.
