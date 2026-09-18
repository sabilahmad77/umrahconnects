# Current frontend routes

Generated from actual `apps/web/app/**/page.tsx`, with route groups removed: **82 active route families**. See [route-inventory.json](acceptance-evidence/route-inventory.json) for source paths, [route-plan.json](acceptance-evidence/route-plan.json) for actual tested URLs and fixture ownership, and the completion matrix for row-level acceptance.

- AUTH: 5
- SUPER ADMIN: 11
- OPERATOR / SHARED: 14
- OTHER CONFIRMED MODULES — FINANCE: 5
- VISA AGENCY: 6
- TRAVELER: 8
- HOTEL: 4
- OTHER CONFIRMED MODULES: 1
- TRANSPORT: 10
- PUBLIC: 18

Finance and organization onboarding are confirmed additional modules. Shared routes are reused by roles whose authoritative API permissions allow access. Hotel, transport and visa seeded provider workspaces have empty owned records; Operator-owned records supply additional positive detail rendering checks without changing organization ownership or assigning roles. `/requests/[id]` uses a known-missing UUID because the current owner request collection is empty. Negative fixtures are not positive workflow proof.

The production build's 79 prerendered pages are a build statistic, not the route-family inventory. Dynamic pages are included in the 82-family inventory.
