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

Result: **all mandatory gates PASS** on the integrated branch.

These gates are about the code. They do not cover the one open security item that
is not a code defect: two credential-shaped tokens are present in pushed git
history (`.claude/settings.local.json`). The file is now untracked and ignored,
but only revocation at GitHub and Render closes the exposure. See BLOCKERS.md
BLK-09.
