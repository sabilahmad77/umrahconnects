# STACK_NOTES — Umrah Connect (ground truth, verified 8 Jul 2026)

## Monorepo layout (pnpm workspaces + turbo)
- `apps/web` — **Next.js 14.2 (App Router)**, React 18, Tailwind, TanStack Query, axios. Routes in `app/`, feature components in `components/<module>/`, API hooks in `hooks/use-api.ts` (+ `use-social.ts`, `use-platform.ts`).
- `platform/api` — **NestJS 10 backend (IN THIS REPO — nothing is BLOCKED-EXTERNAL)**. Modules in `src/modules/*`. Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- `apps/mobile` — Expo SDK 54 (out of scope for this loop except notes).
- Install `pnpm install` · run API `pnpm --filter @umrah-connects/api dev` (port 4000) · run web `pnpm --filter @umrah-connects/web dev` (port 3000) · build web `pnpm --filter @umrah-connects/web build` · API tests `pnpm --filter @umrah-connects/api test`.

## /proxy-api — CONFIRMED: a Next.js rewrite in THIS repo
`apps/web/next.config.mjs` rewrites `/proxy-api/:path*` → `${API_ORIGIN}/api/v1/:path*`.
Local dev → `http://localhost:4000`; production (Vercel) → `https://umrah-connect-api.onrender.com`.
So every `/proxy-api/*` endpoint in the PDFs maps to a NestJS controller in `platform/api/src/modules/*`.

## Database / ORM
Prisma 5.22 + PostgreSQL (13 schemas, multiSchema). **No migration files — schema sync via `prisma db push`**; seed via `pnpm db:seed` (`platform/api/prisma/seed.ts`). Local DB `umrah_connects`; production DB on Render (verify writes ONLY against local).

## Auth/session (FIX-01/02 context)
- JWT access token 15 min + refresh token 7 d, stored in `localStorage` (`accessToken`, `refreshToken`); axios `apiClient` (`apps/web/lib/api.ts`) attaches Bearer.
- Client-side gate: `components/providers/auth-provider.tsx` (PUBLIC_PATHS allow-list; **bug: expired access token on hard nav → clearAuth + bounce to /login, never tries refresh**).
- `apiClient` has a single 401 refresh-retry; **bug: terminal failure hard-redirects to /login without returnTo**.
- Demo login = REAL login (`admin@alharamain.sa`) with client-side dashboardType persona.
- `POST /auth/register` DTO has **no `role` field** — `forbidNonWhitelisted` already rejects role injection (400). Signup UI wrongly offers "Super Admin" (FIX-01 = frontend allow-list + verify).

## Canonical status enums (FIX-04) — source of truth = prisma/schema.prisma
- **PilgrimStatus (DB)**: LEAD PROSPECT BOOKED DOCUMENTS_PENDING VISA_PENDING VISA_APPROVED VISA_REJECTED TRAVELING IN_KINGDOM RETURNED CANCELLED
  - **DRIFT**: API DTO (`pilgrims/dto/create-pilgrim.dto.ts`) + web form/filters use a DIFFERENT set (REGISTERED, DOCUMENT_COLLECTION, VISA_APPLIED, DEPARTED, IN_MAKKAH, IN_MADINAH) — 6/10 invalid in DB. This caused the audit's 400 AND the "In Kingdom 5 vs CRM 0" mismatch (reports count DB statuses; CRM filters the phantom ones).
- **InvoiceStatus (DB)**: DRAFT ISSUED SENT PARTIALLY_PAID PAID OVERDUE CANCELLED VOID. Web map misses CANCELLED; filters miss ISSUED/CANCELLED/VOID. "Partial" reachable only via payment recording (backend `POST /finance/invoices/:id/payments` **EXISTS** — PDF marked it missing; discrepancy logged) — UI form missing (FIX-06).
- **BookingStatus (DB)**: DRAFT CONFIRMED PARTIALLY_PAID FULLY_PAID VISA_PROCESSING TRAVELING COMPLETED CANCELLED REFUNDED (server normalizes aliases ENQUIRY/DEPOSIT_PAID etc.).
- **VisaStatus**: see `enum VisaStatus` in schema (verify per-screen during Phase 2).

## PDF-vs-code discrepancies found so far
1. `POST /finance/invoices/{id}/payments` exists (plan says Missing) — FIX-06 is mostly frontend.
2. `/packages` CRUD exists in backend (`packages` module) — FIX-09 = management UI, not new API.
3. Resources cards link to `/help` (working page), not literally `#` — dead-feel, not dead link.
4. Real `href="#"`: login-page footer (Privacy/Terms/Help ×3) + public footer social icons ×5.
5. Pilgrim DTO enum ≠ DB enum — deeper than the plan assumed (server itself is self-inconsistent).

## Deploy loop
Push to `main` → GitHub → Vercel (web, umrahconnect.io) + Render (API) auto-deploy. Production seed/DB ops via DATABASE_URL from Render dashboard (do not run against prod for verification).
