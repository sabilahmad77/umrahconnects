# Local vs Production Parity

Audited 2026-09-17.

| | Local | Production |
|---|---|---|
| Web | `http://localhost:3000` (Next dev) | `https://umrahconnect.io` (Vercel) |
| API | `http://localhost:4100/api/v1` (see note) | `https://umrah-connect-api.onrender.com/api/v1` (Render) |
| Web → API | `/proxy-api` rewrite → `API_PROXY_ORIGIN` | `/proxy-api` rewrite → Render (`next.config` fallback when `VERCEL`/production) |
| Database | PostgreSQL 15 on `127.0.0.1:5433`, seeded | managed Postgres — **not reachable to verify** |

**Local port note.** The documented API port 4000 was occupied on this machine by a Colima (Docker VM) SSH port-forward belonging to an
unrelated container, so the API ran with `PORT=4100` and the web dev server with `API_PROXY_ORIGIN=http://localhost:4100`. Both are
environment variables the code already supports; no file was changed.

## Parity matrix

| Area | Local | Production | Parity | Finding |
|---|---|---|---|---|
| Landing page | PASS | PASS (200, 2.6 KB visible text, same title/description) | YES | Fabricated metrics in both (AUD-017) |
| Public marketing pages (pricing, resources, preview pages) | PASS | PASS (200) | YES | |
| HTTPS / redirect | n/a | `http://` → 308 → `https://` ✓; HSTS 2 y | — | |
| `www` host | n/a | **FAIL** — certificate is for `umrahconnect.io` only | — | AUD-020 |
| Security headers (web) | X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | same + HSTS | YES | |
| Frontend build version | `f71a6de` | **current** — `/admin-tenants/[id]`, `/visa-requests/[id]`, `/finance/invoices/[id]` exist, and the newest document-storage UI strings are in the served bundle | YES | Vercel is serving the latest code |
| Demo login tab | visible | hidden | intended difference | `isDemoAllowed()` |
| Protected-route redirect | PASS | PASS (`/dashboard`, `/admin-users` → `/login`) | YES | |
| API health | PASS (200, db connected) | **FAIL** (no response, 40–120 s) | **NO** | AUD-001 |
| Web → API proxy | PASS | **FAIL** (`/proxy-api/health` hangs 60 s) | **NO** | AUD-001 |
| Login | PASS (API + browser) | **FAIL** — request aborted, no message shown | **NO** | AUD-001, AUD-023 |
| Signup | PARTIAL (roleless account) | BLOCKED | NO | |
| Marketplace listings (public) | PASS (15 listings) | BLOCKED (API) | NO | |
| All authenticated modules | PASS (65/65 routes) | BLOCKED | NO | |
| Database schema | pushed, 13 schemas | not verifiable | UNKNOWN | Applied on container start by design |
| Seed data | 3 operator tenants + community tenant | reported seeded in Aug 2026 (`IMPLEMENTATION_LOG.md`) — not verifiable now | UNKNOWN | |
| Object storage | local disk | local disk inside a container (ephemeral) | same config, worse consequence | AUD-011 |
| Payments | sandbox | sandbox (unless dashboard overrides) | UNKNOWN | |
| CORS | explicit origin list | `render.yaml` declares `CORS_ORIGINS="*"` | **likely NO** — dashboard value not confirmed | AUD-035 |
| `WEB_URL` | `http://localhost:3000` | `render.yaml` declares `http://localhost:3000` | same value, wrong for prod | AUD-036 |
| Swagger | enabled | disabled when `NODE_ENV=production` | intended | |
| `robots.txt` / `sitemap.xml` / favicon | 404 | 404 | YES (both missing) | AUD-030 |
| Console errors on public pages | none | none | YES | |

## Causes of divergence

1. **Backend unavailability** is the only material divergence and it explains every production failure observed. It is not stale code:
   the frontend is current, and the backend artifact built from the same commit boots and serves all 304 routes locally.
2. **Configuration declared in `render.yaml`** (`CORS_ORIGINS="*"`, `WEB_URL=http://localhost:3000`) is test-grade. Whether the
   dashboard overrides it could not be checked.
3. **`www`** was added to DNS since the previous check but not to the Vercel project, so no certificate covers it.

## What could not be compared (BLOCKED)

BLOCKED: every authenticated production workflow, production database state, production environment variables.
Reason: the production API does not respond; dashboards require human sign-in.
Evidence: repeated timeouts on `/health` and `/proxy-api/*`, and a real browser login that never completes.
Required input: Render dashboard access (service `srv-d94peplckfvc73adlr9g`) and Vercel dashboard access.
Impact on audit: production parity is established for the frontend only.
