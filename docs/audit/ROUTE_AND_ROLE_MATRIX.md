# Route & Role Matrix

Audited 2026-09-17. Source: `audit/sweep_routes_2026.js`, which loaded every static route in `apps/web/app` as three real identities and recorded
HTTP status, final path after client redirects, uncaught page errors, console errors and failed `/proxy-api` calls.

- **anonymous** — no session
- **operator** — real login, `admin@alharamain.sa` (the only role that exists: *Operator Admin*)
- **roleless** — a real self-signup account (`POST /auth/register`), which receives no role

Dynamic routes (`[id]`, `[slug]`) were loaded separately with real record ids as the operator: all 12 rendered live records with no page
errors and no failed API calls (`/requests/[id]` had no record to open).

## 1. Real role model vs. product surfaces

| Role (product concept) | Backend role exists? | How it is reached today | Post-login route | Backend permissions | Status |
|---|---|---|---|---|---|
| Umrah Operator / Agency | **Yes** — *Operator Admin* (per tenant, 39 permissions) | real login | `/dashboard` | all 39, **including platform admin** | Works; over-privileged (AUD-002) |
| Hotel | **No** | Quick Demo persona only (same account as operator) | `/hotel-dashboard` | operator's | UI label only (AUD-004) |
| Transport company | **No** | Quick Demo persona only | `/transport-dashboard` | operator's | UI label only |
| Visa agency | **No** | Quick Demo persona only | `/visa-dashboard` | operator's | UI label only |
| Finance manager | **No** | Quick Demo persona only | `/finance-dashboard` | operator's | UI label only |
| Super Admin | **No** | Quick Demo persona only | `/admin-dashboard` | operator's (which already include `/admin/*`) | UI label only; any operator can call admin APIs |
| Pilgrim / Traveler | **No** | self-signup (roleless) or Quick Demo persona | `/dashboard` (operator layout) | **none** | Broken (AUD-005) |

Quick Demo Access is hidden on `umrahconnect.io`, so in production only the operator experience (and the broken roleless one) is reachable.

### Role flow

```
ROLE            → LOGIN                         → POST-LOGIN      → DASHBOARD            → BACKEND PERMISSIONS         → STATUS
Operator        → email+password                → /dashboard      → Operations Pulse     → Operator Admin (39)         → VERIFIED (over-privileged)
Hotel           → demo tile → operator account  → /hotel-dashboard→ Hotel dashboard      → Operator Admin (39)         → UI-ONLY
Transport       → demo tile → operator account  → /transport-dashboard                    → Operator Admin (39)         → UI-ONLY
Visa            → demo tile → operator account  → /visa-dashboard → Visa dashboard       → Operator Admin (39)         → UI-ONLY
Finance         → demo tile → operator account  → /finance-dashboard                      → Operator Admin (39)         → UI-ONLY
Super Admin     → demo tile → operator account  → /admin-dashboard→ Platform control     → Operator Admin (39)         → UI-ONLY (RBAC bypass by design)
Pilgrim         → signup → roleless account     → /dashboard      → operator layout, 403s→ none                        → BROKEN
```

### RBAC bypass tests

| Attempt | Result | Verdict |
|---|---|---|
| Anonymous opens `/admin-users` | redirected to `/login` | ✓ |
| Anonymous calls `GET /admin/users` | 401 | ✓ |
| Roleless user opens `/admin-users` | **page renders** (shell), data calls 403 | UI guard missing (AUD-024); data safe |
| Roleless user calls `GET /admin/users` | 403 | ✓ |
| **Tenant operator (Kaaba) calls `GET /admin/users`** | **200 — users of every tenant** | ✗ **AUD-002** |
| **Tenant operator calls `GET /admin/users/export`** | **200 — CSV of every tenant's users** | ✗ **AUD-002** |
| Tenant operator suspends another tenant | 200 (bp07) | ✗ **AUD-002** |
| Tenant operator edits another tenant's hotel | 200 | ✗ **AUD-003** |
| Tenant operator reads another tenant's pilgrim/booking/invoice | 404 | ✓ |
| Editing `currentUser.dashboardType` in localStorage | switches the dashboard UI | cosmetic only — backend authority unchanged |

## 2. Route inventory (79 routes, 65 static swept)

Cells show HTTP status, or `→ path` when the client redirected. The operator column is the functional baseline.

| Route | Intended role | In sidebar | anonymous | operator | roleless | Data source |
|---|---|---|---|---|---|---|
| `/` | Public |  | 200 | 200 | 200 | static |
| `/about` | Public |  | 200 | 200 | 200 | static |
| `/admin-dashboard` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-inquiries` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-kyc` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-listings` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-logs` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-roles` | Super Admin (label) | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/admin-settings` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-support` | Super Admin (label) | yes | → /login | 200 | 200 | live API |
| `/admin-tenants` | Super Admin (label) | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/admin-tenants/[id]` | Super Admin (label) |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/admin-users` | Super Admin (label) | yes | → /login | 200 | 200 · 3 API fail | live API |
| `/api-docs` | Public |  | 200 | 200 | 200 | static |
| `/bookings` | Operator | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/bookings/[id]` | Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/budget-plans` | Finance (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/careers` | Public |  | 200 | 200 | 200 | static |
| `/compliance` | Visa (label) / Operator | yes | → /login | 200 | 200 · 3 API fail | live API |
| `/compliance/[id]` | Visa (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/connections` | All authenticated | yes | → /login | 200 | 200 | live API |
| `/contact` | Public |  | 200 | 200 | 200 | static |
| `/dashboard` | Operator | yes | → /login | 200 | 200 · 6 API fail | live API |
| `/discover` | All authenticated | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/finance` | Finance (label) / Operator | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/finance-dashboard` | Finance (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/finance-payments` | Finance (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/finance/invoices/[id]` | Finance (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/groups` | All authenticated | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/groups/[id]` | Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/help` | Public |  | 200 | 200 | 200 | static |
| `/hotel-bookings` | Hotel (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/hotel-dashboard` | Hotel (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/hotels` | Hotel (label) / Operator | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/hotels/[id]` | Hotel (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/integrations` | Public |  | 200 | 200 | 200 | static |
| `/login` | Public |  | 200 | → /dashboard | → /dashboard | static + API |
| `/marketplace` | All authenticated | yes | → /login | 200 | 200 | live API |
| `/marketplace-preview` | Public |  | 200 | 200 | 200 | static + API |
| `/marketplace/[id]` | Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/messages` | All authenticated | yes | → /login | 200 | 200 | live API |
| `/my-bookings` | Pilgrim/Traveler (label) | yes | → /login | 200 | 200 | live API |
| `/my-offers` | Pilgrim/Traveler (label) | yes | → /login | 200 | 200 | live API |
| `/packages` | Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/partners` | Public |  | 200 | 200 | 200 | static |
| `/pilgrims` | Operator | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/pilgrims/[id]` | Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/pricing` | Public |  | 200 | 200 | 200 | static |
| `/privacy` | Public |  | 200 | 200 | 200 | static |
| `/profile` | All authenticated | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/reports` | Operator | yes | → /login | 200 | 200 · 5 API fail | live API |
| `/requests` | Pilgrim/Traveler (label) | yes | → /login | 200 | 200 | live API |
| `/requests/[id]` | Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/reset-password` | Public |  | 200 | 200 | 200 | static |
| `/resources` | Public |  | 200 | 200 | 200 | static |
| `/resources/[slug]` | Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/security` | Public |  | 200 | 200 | 200 | static |
| `/settings` | Operator |  | → /login | 200 | 200 | live API |
| `/signup` | Public |  | 200 | 200 | 200 | static |
| `/social` | All authenticated | yes | → /login | 200 | 200 · 4 API fail | live API |
| `/social-preview` | Public |  | 200 | 200 | 200 | static |
| `/solutions` | Public |  | 200 | 200 | 200 | static |
| `/terms` | Public |  | 200 | 200 | 200 | static |
| `/transport` | Transport (label) / Operator | yes | → /login | → /transport/vehicles | → /transport/vehicles | live API |
| `/transport-dashboard` | Transport (label) / Operator | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/transport/assignments` | Transport (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/transport/bookings` | Transport (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/transport/drivers` | Transport (label) / Operator | yes | → /login | 200 | 200 · 4 API fail | live API |
| `/transport/drivers/[id]` | Transport (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/transport/routes` | Transport (label) / Operator | yes | → /login | 200 | 200 · 4 API fail | live API |
| `/transport/routes/[id]` | Transport (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/transport/vehicles` | Transport (label) / Operator | yes | → /login | 200 | 200 · 4 API fail | live API |
| `/transport/vehicles/[id]` | Transport (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/travel-plan` | Pilgrim/Traveler (label) | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/visa-dashboard` | Visa (label) / Operator | yes | → /login | 200 | 200 · 1 API fail | live API |
| `/visa-documents` | Visa (label) / Operator | yes | → /login | 200 | 200 · 2 API fail | live API |
| `/visa-requests` | Visa (label) / Operator | yes | → /login | 200 | 200 · 3 API fail | live API |
| `/visa-requests/[id]` | Visa (label) / Operator |  | n/a (dynamic) | n/a (dynamic) | n/a (dynamic) | live (by id) |
| `/workflow` | Public |  | 200 | 200 | 200 | static |

## 3. Findings from the sweep

| Finding | Detail |
|---|---|
| Operator baseline | **65/65 static routes return 200 with 0 uncaught page errors, 0 console errors, 0 failed API calls.** Plus 12/12 dynamic routes render live records. |
| Anonymous | 45 protected routes redirect to `/login` ✓. Before redirecting, each fires 1–5 API calls that 401 (AUD-029). |
| Roleless | Never redirected. Lands on the operator dashboard; 44 routes show shells whose data calls return 403 (AUD-005, AUD-024). `/login` itself fires 403s because the session exists. |
| Dead links | None — all 44 sidebar links resolve to a page. |
| Redirect quirks | `/transport` → `/transport/vehicles` (intentional); `/login` → `/dashboard` when signed in (intentional). |
| Static pages | 18 public marketing pages make no API calls (expected). `marketplace-preview` and `social-preview` are public previews. |
| Mock content on live pages | hardcoded trend deltas and "All systems live" on the operator dashboard; hardcoded deltas on `/finance` and `/reports` (AUD-018, AUD-027). |
| Phone width | authenticated layout keeps the sidebar open at 375 px and clips content (AUD-019). |

### Methodology note

An automated "error screen" heuristic initially flagged 20+ operator pages. That was a false positive: `textContent` includes Next's
RSC payload, which always embeds the not-found template. Re-checked with visible text (`innerText`): **no operator page shows an error
or not-found screen.** The flags were discarded rather than reported.
