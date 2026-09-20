# Functional browser matrix

Derived from A10's raw results by `audit/eng100/browser_matrix.py`; do not edit by
hand. A10 is the independent tester — it implemented none of the code it exercised.

| | |
|---|---|
| Tester | A10 — independent functional browser QA |
| Browser | Google Chrome 153.0.8010.52 (headless, driven by playwright-core 1.49.1) |
| Web under test | http://localhost:3300 (production build, `next start`) |
| API under test | http://localhost:4300 (/api/v1) (built; connects as the non-superuser runtime role, so row-level security is enforced) |
| Candidate revision | `5875835` (earlier batches recorded their own revision per row) |
| Method | Every session was created through the real /login form. No tokens were injected and no storage was edited. API probes are same-origin fetches issued from inside the signed-in page, using that page’s own session, exactly as the app’s API client does. |
| Generated | 2026-09-20T19:14:14.539Z |

## Coverage

| | Count |
|---|---:|
| Route templates in the inventory | 87 |
| Route templates exercised | 87 |
| Concrete instances exercised beyond the templates | 6 |
| Identities (roles + anonymous) | 18 |
| Role × route control inventories captured | 363 |
| Checks recorded | 3329 |
| **Passed** | **3262** |
| Failed | 39 |
| Untested (with a recorded reason) | 28 |

Identities exercised: anonymous, financeA, hotelA, hotelB, operatorAdminA, operatorAdminB, operatorStaffA, own1, own2, superAdmin, transportA, transportB, travelerA, travelerB, travelerOnboarding, travelerUnverified, visaA, visaB.

## By kind of check

| Kind | Checks | Pass | Fail | Untested |
|---|---:|---:|---:|---:|
| JavaScript console errors on the page | 387 | 387 | 0 | 0 |
| Permission denied (UI state and the API refusing the same call) | 1437 | 1397 | 15 | 25 |
| Duplicate submission (double click) | 30 | 21 | 9 | 0 |
| Empty state | 1 | 1 | 0 | 0 |
| Error state | 1 | 1 | 0 | 0 |
| State after a fresh sign-in | 4 | 4 | 0 | 0 |
| Required field / invalid input | 56 | 56 | 0 | 0 |
| Request loops | 364 | 364 | 0 | 0 |
| Failed network requests on the page | 388 | 375 | 13 | 0 |
| Persistence after refresh | 28 | 28 | 0 | 0 |
| Positive path | 564 | 559 | 2 | 3 |
| Shared/public surface | 22 | 22 | 0 | 0 |
| Cross-tenant probe (other organization’s record) | 47 | 47 | 0 | 0 |

## By area

| Area | Checks | Pass | Fail | Untested |
|---|---:|---:|---:|---:|
| a11y | 2 | 0 | 2 | 0 |
| access | 960 | 958 | 2 | 0 |
| admin | 22 | 22 | 0 | 0 |
| api-refusal | 893 | 857 | 11 | 25 |
| auth | 55 | 54 | 0 | 1 |
| bookings | 6 | 5 | 0 | 1 |
| cleanup | 2 | 2 | 0 | 0 |
| finance | 17 | 17 | 0 | 0 |
| health | 1138 | 1125 | 13 | 0 |
| hotel | 14 | 12 | 2 | 0 |
| marketplace | 25 | 25 | 0 | 0 |
| navigation | 15 | 15 | 0 | 0 |
| notifications | 1 | 1 | 0 | 0 |
| onboarding | 6 | 6 | 0 | 0 |
| packages | 4 | 4 | 0 | 0 |
| payments | 6 | 6 | 0 | 0 |
| pilgrims | 19 | 16 | 3 | 0 |
| public | 26 | 26 | 0 | 0 |
| reports | 4 | 4 | 0 | 0 |
| requests | 18 | 17 | 1 | 0 |
| settings | 20 | 19 | 1 | 0 |
| social | 31 | 28 | 2 | 1 |
| transport | 19 | 17 | 2 | 0 |
| travel-plan | 8 | 8 | 0 | 0 |
| visa | 18 | 18 | 0 | 0 |

## Failures

Every failure below was reported as a defect, fixed on the candidate and recorded in
`ENGINEERING_100_DEFECTS.md`; rows re-verified after a fix carry the later revision.

| Route | Role | Action | Expected | Actual |
|---|---|---|---|---|
| `/marketplace/[id]` | transportA | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | visaA | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | hotelA | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | operatorAdminA | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/settings` | own1 | double-click Save preferences | one PUT | 2 PUT(s) |
| `/marketplace/[id]` | travelerA | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | operatorStaffA | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/reset-password` | anonymous | page exposes a <main> landmark | one <main> landmark (as /login, /signup, /verify-email have) | main landmarks=0 |
| `/marketplace/[id]` | transportB | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | hotelB | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | operatorAdminB | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | travelerB | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | travelerOnboarding | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/marketplace/[id]` | travelerUnverified | failed API requests on /marketplace/4f51195a-210e-4a81-9084-aecd3a07f4d7 | no 4xx/5xx or failed /api requests | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/reports` | visaA | API GET /reports/pilgrims for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | visaA | API GET /reports/hotels for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | visaA | API GET /reports/visa for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | operatorStaffA | API GET /reports/pilgrims for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | operatorStaffA | API GET /reports/hotels for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | operatorStaffA | API GET /reports/visa for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | visaB | API GET /reports/pilgrims for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | visaB | API GET /reports/hotels for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/reports` | visaB | API GET /reports/visa for a role the UI denies | 403 (or 404 for another organization's record) | 200 |
| `/requests/[id]` | travelerA | double-click Accept | one successful accept | POST /api/marketplace/requests/ae95660b-e629-4c94-a7a3-0d958fb976b0/offers/05ff62d9-b44f-477f-ba6f-2f88290fd5d6/accept 201, POST /api/marketplace/requests/ae95660b-e629-4c94-a7a3-0d958fb976b0/offers/05ff62d9-b44f-477f-ba6f-2f88290fd5d6/accept 201 |
| `/social` | travelerA | double-click Post | one POST /social/posts | POST /api/social/posts 201, POST /api/social/posts 201 |
| `/requests` | financeA | API POST /marketplace/requests (UI denies /requests to this role) | 403 (role has no marketplace capability) | 201 |
| `/requests` | superAdmin | API POST /marketplace/requests (UI denies /requests to this role) | 403 (role has no marketplace capability) | 201 |
| `/reports` | visaA | Reports page rule vs API policy | page opens for a role the API serves reports to (or the API refuses them too) | holds reporting:report:read=true finance:report:read=false; UI=denied (Permission required); nav shows Reports=false; API: /reports/overview 200, /reports/pilgrims 200, /reports/visa 200, /reports/finance 403 |
| `/reports` | operatorStaffA | Reports page rule vs API policy | page opens for a role the API serves reports to (or the API refuses them too) | holds reporting:report:read=true finance:report:read=false; UI=denied (Permission required); nav shows Reports=false; API: /reports/overview 200, /reports/pilgrims 200, /reports/visa 200, /reports/finance 403 |
| `/messages` | travelerA | double-click Send message | one POST | POST /api/social/conversations/87212477-7c7b-44f1-b7d4-babdf6eddd41/messages 201, POST /api/social/conversations/87212477-7c7b-44f1-b7d4-babdf6eddd41/messages 201 |
| `/pilgrims` | operatorAdminA | double-click Add pilgrim | exactly one POST /pilgrims 2xx | POST /api/pilgrims 201, POST /api/pilgrims 201 |
| `/pilgrims` | operatorStaffA | staff cannot archive pilgrims (no crm:pilgrim:delete) | no Archive control; API DELETE 403 | archiveVisible=true DELETE=403 |
| `/hotels` | hotelA | double-click Add hotel | one POST 2xx | POST /api/hotels 201, POST /api/hotels 201 |
| `/transport/vehicles` | transportA | double-click Add vehicle | one POST 2xx | POST /api/transport/vehicles 201, POST /api/transport/vehicles 201 |
| `/transport/routes` | transportA | double-click Add route | one POST 2xx | POST /api/transport/routes 201, POST /api/transport/routes 201 |
| `/hotels/[id]` | hotelA | double-click Contract allotment | one allotment created | POST /api/hotels/1b5c71f1-5a79-4071-a590-02c18d8cd89c/allotments 201, POST /api/hotels/1b5c71f1-5a79-4071-a590-02c18d8cd89c/allotments 201 |
| `/marketplace/[id]` | travelerA | failed API requests when a non-owner opens a listing (re-checked at the new revision) | no 4xx request | GET /api/marketplace/listings/mine/4f51195a-210e-4a81-9084-aecd3a07f4d7 404 |
| `/pilgrims` | operatorStaffA | staff are not offered Archive without crm:pilgrim:delete (re-checked at the new revision) | no Archive control; API DELETE 403 | archiveVisible=true DELETE=403 |
| `/reset-password` | anonymous | page exposes a <main> landmark (re-checked at the new revision) | one <main> | main landmarks=0 |

## Untested, with reasons

| Route | Role | Action | Why it was not tested |
|---|---|---|---|
| `/login` | anonymous | Google sign-in button | provider: Google sign-in is not configured in this environment (button correctly hidden) |
| `/admin-support` | operatorAdminA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | operatorAdminA | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | hotelA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | hotelA | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | transportA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | transportA | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | visaA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | visaA | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | travelerA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | superAdmin | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | financeA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | financeA | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | operatorStaffA | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | operatorStaffA | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | operatorAdminB | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | operatorAdminB | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | hotelB | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | hotelB | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | transportB | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | transportB | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | visaB | API refuses the route's data calls | no observed endpoint |
| `/travel-plan/link` | visaB | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | travelerB | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | travelerUnverified | API refuses the route's data calls | no observed endpoint |
| `/admin-support` | travelerOnboarding | API refuses the route's data calls | no observed endpoint |
| `/social/groups/[id]` | travelerA | open own group | fixture has no group membership |
| `/bookings/[id]` | operatorAdminA | move booking status | no status control visible on the overview tab |

## Evidence

- Raw results (every row with route, role, action, expected, actual, request method/path/status, readback, screenshot, revision, timestamp): `evidence/eng100/a10/functional-matrix.json`
- A10's own summary: `evidence/eng100/a10/SUMMARY.md`
- Screenshots: `evidence/eng100/a10/screens/`
- Scripts: `audit/eng100/a10/`
