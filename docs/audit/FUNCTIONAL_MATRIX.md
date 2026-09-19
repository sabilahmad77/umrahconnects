# Functional Matrix

> **Render references here are RETIRED (2026-09-19).** Render (`umrah-connect-api.onrender.com`, `render.yaml`) is retired
> from the target architecture (API → Hostinger KVM 8). This historical record is kept unchanged as evidence; current
> state and the remaining owner steps: `docs/control-tower/RENDER_RETIREMENT.md`.

Generated from runtime evidence on 2026-09-17 (local stack: API `:4100`, web `:3000`; production: https://umrahconnect.io).

**Status vocabulary:** VERIFIED PASS · PARTIAL · FAIL · MOCK · MISSING · BLOCKED · UNVERIFIED. Mock/static findings are recorded per-feature in the Notes column and itemised in `CURRENT_STATE_AUDIT.md` §18.

`(label)` in the Role column means the role exists only as a client-side persona label — the backend has a single role, *Operator Admin* (AUD-004).

Production column: **BLOCKED** means the feature could not be exercised because the production API does not respond (AUD-001). It is not a claim that the feature is broken in production.

## Summary

| Status | Count |
|---|---|
| VERIFIED PASS | 25 |
| PARTIAL | 17 |
| FAIL | 11 |
| MOCK | 4 |
| MISSING | 8 |
| BLOCKED | 3 |
| UNVERIFIED | 5 |
| **Total** | **73** |

Verified-pass share: **25/73 = 34%** of audited capabilities. This is a share of the rows below, not a product-completion estimate.

## Matrix

| ID | Domain | Role | Feature | Frontend | Backend | Database | Integration | Local | Production | Status | Sev | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FM-001 | Public | Anonymous | Landing & marketing pages | Y | n/a | n/a | n/a | PASS | PASS | VERIFIED PASS | - | sweep: 18 public routes 200, 0 errors; prod 200 | Landing shows fabricated metrics (AUD-017) |
| FM-002 | Public | Anonymous | Resources articles (8) | Y | n/a | n/a | n/a | PASS | PASS | VERIFIED PASS | - | /resources/[slug] 200 local+prod |  |
| FM-003 | Public | Anonymous | Protected-route redirect to /login | Y | Y | n/a | n/a | PASS | PASS | VERIFIED PASS | - | 45 routes redirect (sweep anon); prod /dashboard,/admin-users -> /login |  |
| FM-004 | Auth | All | Email-first login | Y | Y | Y | n/a | PASS | FAIL | PARTIAL | P0 | local 200 + browser login; prod request aborted after 45s | Prod API down (AUD-001) |
| FM-005 | Auth | All | Self-service signup | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P1 | POST /auth/register 201; account has no role -> 403 on feed, pilgrims, visa | AUD-005 |
| FM-006 | Auth | All | Password reset | Y | Y | Y | Email: none | PASS (dev link) | BLOCKED | PARTIAL | P1 | devResetLink works locally; no mailer; token reusable | AUD-010, AUD-014, AUD-015 |
| FM-007 | Auth | All | Email verification | N | N | field only | none | n/a | n/a | MISSING | P2 | no verify route; users stay PENDING_VERIFICATION |  |
| FM-008 | Auth | All | Token refresh (coalesced) | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | fix02 suite historically; hard reloads keep session in every browser suite |  |
| FM-009 | Auth | All | Logout / force logout | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P3 | force-logout revokes refresh tokens (bp07); access token valid <=15 min after lock | AUD-025 |
| FM-010 | Auth | Demo | Quick Demo Access personas | Y | n/a | n/a | n/a | PASS | hidden | PARTIAL | P1 | all 7 personas log in as admin@alharamain.sa; hidden on prod | UI-only roles (AUD-004) |
| FM-011 | RBAC | All | Role model (7 business roles) | Y (labels) | 1 role only | Y | n/a | FAIL | FAIL | FAIL | P1 | DB: only 'Operator Admin' role in 3 tenants; 0 hotel/transport/visa/finance/pilgrim/super-admin roles | AUD-004 |
| FM-012 | RBAC | Super Admin | Platform admin isolated from tenants | Y | Y | Y | n/a | FAIL | BLOCKED | FAIL | P0 | kaaba operator: 200 on /admin/users (all tenants), /admin/users/export, /admin/finance | AUD-002 |
| FM-013 | RBAC | All | Tenant data isolation (core CRM) | n/a | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | cross-tenant GET by id -> 404 for pilgrims, bookings, invoices, payments, vehicles, visas, packages, groups |  |
| FM-014 | RBAC | All | Tenant isolation — hotels | n/a | N | Y | n/a | FAIL | BLOCKED | FAIL | P0 | kaaba PUT al-haramain hotel 200 (phone changed, restored); rooms readable | AUD-003 |
| FM-015 | RBAC | All | Permission-gated routes reachable | n/a | partial | partial | n/a | FAIL | BLOCKED | PARTIAL | P2 | 3 permissions referenced but never defined -> 403 for everyone | AUD-016 |
| FM-016 | RBAC | All | UI role guards | partial | n/a | n/a | n/a | PARTIAL | n/a | PARTIAL | P3 | roleless user can open /admin-* shells (backend returns 403) | AUD-024 |
| FM-017 | CRM | Operator | Operator dashboard | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P2 | renders live counts; trend % and 'All systems live' hardcoded | AUD-018, AUD-027 |
| FM-018 | CRM | Operator | Pilgrims CRUD + status | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | FIX-04/BP-03 history; detail page renders live record |  |
| FM-019 | CRM | Operator | Packages | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | /packages renders, /packages/:id 200 |  |
| FM-020 | CRM | Operator | Bookings + detail | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | /bookings/[id] shows live booking | seed inconsistency (AUD-028) |
| FM-021 | CRM | Operator | Groups (posts/notes/polls) | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp05 23/23 incl. group counters |  |
| FM-022 | CRM | Operator | Reports | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P2 | live values + hardcoded trend deltas | AUD-018 |
| FM-023 | Hotel | Hotel (label) | Hotels, room types, rooms | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P0 | bp02 24/24; but unscoped by tenant | AUD-003 |
| FM-024 | Hotel | Hotel (label) | Hotel bookings + occupancy | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp02 occupancy 0->25% |  |
| FM-025 | Hotel | Hotel (label) | Room assignments | Y | Y (unreachable) | Y | n/a | FAIL | BLOCKED | FAIL | P2 | GET /hotels/:id/assignments 403 for operator (perm undefined) | AUD-016 |
| FM-026 | Hotel | Hotel (label) | Allotments | Y | Y | Y | n/a | UNVERIFIED | BLOCKED | UNVERIFIED | - | route 200 in GET sweep; no mutation proof |  |
| FM-027 | Transport | Transport (label) | Vehicles, drivers, routes | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp02 24/24; detail pages render |  |
| FM-028 | Transport | Transport (label) | Assignments / bookings | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp02 assignment + booking persist |  |
| FM-029 | Visa | Visa (label) | Visa applications + reject w/ reason | Y | Y | Y | Regulators PLANNED | PASS | BLOCKED | VERIFIED PASS | - | bp02 visa checklist + reject |  |
| FM-030 | Visa | Visa (label) | Service request ticket workflow | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp06 51/51 API + 29/29 browser |  |
| FM-031 | Visa | Visa (label) | Document management (versions, verify, expiry) | Y | Y | Y | Storage: local | PASS | BLOCKED | PARTIAL | P1 | bp08 46/46 + 19/19; files public + ephemeral | AUD-006, AUD-011 |
| FM-032 | Visa | Visa (label) | Regulator integrations (Nusuk/SISKOPATUH) | label | N | N | N | n/a | n/a | MISSING | - | honestly labelled PLANNED | Not a defect |
| FM-033 | Finance | Finance (label) | Invoices + manual payments | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | FIX-06 history; invoice detail renders |  |
| FM-034 | Finance | Finance (label) | Gateway payments (sandbox) | Y | Y | Y | Sandbox | PASS | BLOCKED | VERIFIED PASS | - | bp09 46/46 + 13/13 |  |
| FM-035 | Finance | Finance (label) | Live card gateway (Stripe) | Y | stub | Y | Stripe: none | n/a | n/a | BLOCKED | P2 | stripe provider throws 'not enabled'; 503 names missing keys | AUD-022 |
| FM-036 | Finance | Finance (label) | Budget plans | Y | Y | Y | n/a | UNVERIFIED | BLOCKED | UNVERIFIED | - | page renders, list 200; no mutation proof |  |
| FM-037 | Finance | Finance (label) | ZATCA e-invoicing | N | fields only | fields | none | n/a | n/a | MISSING | P2 | zatca* columns exist; no code | KSA compliance gap |
| FM-038 | Marketplace | All | Listings browse + detail | Y | Y | Y | n/a | PASS | FAIL | PARTIAL | P1 | local 200; prod depends on dead API | AUD-001 |
| FM-039 | Marketplace | All | Request -> offer -> accept -> booking | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P1 | cross-tenant loop 201 x4; provider cannot discover others' requests | AUD-009, AUD-013 |
| FM-040 | Social | All | Feed, posts, likes, comments | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp05 23/23 + 7/7 |  |
| FM-041 | Social | All | Follow / discover | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp05 |  |
| FM-042 | Social | All | Connections (request/accept) | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | A->K request 201, K accept 201, CONNECTION_REQUEST/ACCEPTED notifications |  |
| FM-043 | Social | All | Direct messaging | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | cross-tenant conversation: K reads A's message |  |
| FM-044 | Social | Pilgrim | Traveler social experience | Y | Y | Y | n/a | FAIL | BLOCKED | FAIL | P1 | self-signup account 403 on /social/feed | AUD-005 |
| FM-045 | Platform | All | In-app notifications | Y | Y | Y | n/a | PASS | BLOCKED | VERIFIED PASS | - | bp06 8 notifications to 2nd account; connection + offer notifications |  |
| FM-046 | Platform | All | Realtime push (websocket/SSE) | N | N | n/a | none | n/a | n/a | MISSING | P3 | no transport; 15-30s polling | AUD-034 |
| FM-047 | Platform | All | Email / SMS / WhatsApp | N | N | n/a | none | n/a | n/a | MISSING | P1 | no mailer or SMS library | AUD-010 |
| FM-048 | Platform | All | Background jobs / reminders | n/a | N | n/a | none | n/a | n/a | MISSING | P3 | no scheduler, queue or cron | AUD-038 |
| FM-049 | Admin | Super Admin (label) | Tenants management | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P0 | bp07 55/55 + 34/34; but any tenant admin can use it | AUD-002 |
| FM-050 | Admin | Super Admin (label) | Users management + export | Y | Y | Y | n/a | PASS | BLOCKED | PARTIAL | P0 | bp07; PII export available to any tenant admin | AUD-002 |
| FM-051 | Admin | Super Admin (label) | KYC review | Y | Y | Y | n/a | UNVERIFIED | BLOCKED | UNVERIFIED | P2 | list 200; approve sets tenant ACTIVE; no end-to-end proof; no KYC enforcement |  |
| FM-052 | Admin | Super Admin (label) | Listings moderation, logs, inquiries, roles | Y | Y | Y | n/a | PARTIAL | BLOCKED | UNVERIFIED | - | pages render, GETs 200; mutations not exercised |  |
| FM-053 | Admin | Super Admin (label) | Settings / support | Y | partial | ? | n/a | UNVERIFIED | BLOCKED | UNVERIFIED | - | render only |  |
| FM-054 | Admin | Anonymous | Public tenant creation | n/a | Y | Y | n/a | FAIL | BLOCKED | FAIL | P1 | unauth POST /tenants 201 with arbitrary parentTenantId | AUD-008 |
| FM-055 | Security | All | Upload access control | n/a | N | n/a | local disk | FAIL | BLOCKED | FAIL | P1 | unauth GET /uploads/visa-documents/... 200 (API and web proxy) | AUD-006 |
| FM-056 | Security | All | Rate limiting / brute-force protection | n/a | configured, not enforced | n/a | n/a | FAIL | BLOCKED | FAIL | P1 | 120 bad logins -> 120x401, 0x429 | AUD-007 |
| FM-057 | Security | All | Security headers (helmet, HSTS) | Y | Y | n/a | n/a | PASS | PASS (web) | VERIFIED PASS | - | API: CSP, HSTS, nosniff; Vercel: HSTS, DENY |  |
| FM-058 | Static | Anonymous | Landing-page platform metrics | Y (hardcoded) | N | N | n/a | MOCK | MOCK | MOCK | P2 | app/page.tsx SERVICES: 1,256 bookings, 4.28M applications, 12,840 journeys; 'Trusted by thousands' | AUD-017 |
| FM-059 | Static | Operator/Finance | KPI trend deltas (+12%, +8%, +18%) | Y (hardcoded) | N | N | n/a | MOCK | BLOCKED | MOCK | P2 | operations-pulse.tsx, finance-view.tsx, reports-view.tsx string literals | AUD-018 |
| FM-060 | Static | Operator | 'All systems live' status badge | Y (hardcoded) | N | N | n/a | MOCK | BLOCKED | MOCK | P3 | operations-pulse.tsx:116, no health query | AUD-027 |
| FM-061 | Static | Mobile user | Mobile alerts sample notifications | Y (hardcoded) | N | N | n/a | MOCK | n/a | MOCK | P2 | apps/mobile/app/(tabs)/alerts.tsx SAMPLE array shown when backend has none | AUD-021 |
| FM-062 | Static | Anonymous | Integrations page claims | Y (static) | n/a | n/a | n/a | PARTIAL | PARTIAL | PARTIAL | P3 | claims 'real-time notification engine' (polling only); regulator items honest | AUD-034 |
| FM-063 | Mobile | All | Expo app | Y | via API | via API | n/a | UNVERIFIED | FAIL | PARTIAL | P2 | tsc 2 errors; dead trycloudflare default URL; fake sample alerts; not launched in this audit | AUD-021 |
| FM-064 | Engineering | n/a | Typecheck (api/web) | n/a | n/a | n/a | n/a | PASS | n/a | VERIFIED PASS | - | tsc exit 0 both |  |
| FM-065 | Engineering | n/a | Production builds | n/a | n/a | n/a | n/a | PASS | PASS (web) | VERIFIED PASS | - | nest build exit 0; next build exit 0 |  |
| FM-066 | Engineering | n/a | Lint | n/a | n/a | n/a | n/a | FAIL | n/a | FAIL | P2 | no ESLint config; api eslint exit 2; next lint prompts | AUD-026 |
| FM-067 | Engineering | n/a | Unit / integration tests | n/a | n/a | n/a | n/a | FAIL | n/a | MISSING | P1 | 0 test files; vitest exits 1 in api and web | AUD-012 |
| FM-068 | Engineering | n/a | CI/CD pipeline | n/a | n/a | n/a | n/a | n/a | n/a | MISSING | P2 | no .github; deploy = push main | AUD-012 |
| FM-069 | Engineering | n/a | Responsive (phone width) | partial | n/a | n/a | n/a | FAIL | n/a | FAIL | P2 | sidebar persistent at 375px; content clipped | AUD-019 |
| FM-070 | Infra | n/a | Frontend deployment (Vercel) | Y | n/a | n/a | Vercel | n/a | PASS | VERIFIED PASS | - | umrahconnect.io 200; serves latest build |  |
| FM-071 | Infra | n/a | Backend deployment (Render) | n/a | Y | n/a | Render | PASS (artifact) | FAIL | BLOCKED | P0 | no response since 2026-08-22 | AUD-001 |
| FM-072 | Infra | n/a | www subdomain | n/a | n/a | n/a | DNS/Vercel | n/a | FAIL | FAIL | P2 | DNS resolves; cert CN=umrahconnect.io only | AUD-020 |
| FM-073 | Infra | n/a | Durable object storage | n/a | abstraction only | n/a | S3/Cloudinary: none | n/a | FAIL | BLOCKED | P1 | STORAGE_DRIVER=local; ephemeral in container | AUD-011 |
