# 01 — Current Architecture

Captured from the old Mac on 2026-09-12 at commit `1b16839`.
Everything here was read out of the repository, not assumed.

## Repository

| | |
|---|---|
| GitHub | `https://github.com/sabilahmad77/umrahconnects` (**public**) |
| Default branch | `main` |
| Old-Mac path | `/Users/macbook/Projects/umrah-connects` |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Package manager | pnpm `9.12.0` (pinned via `packageManager`) |

Brand name in all public copy is exactly **“Umrah Connect”**. Only the repo
slug keeps the trailing `s`.

## Layout

```
umrah-connects/
├─ apps/
│  ├─ web/          @umrah-connects/web     Next.js 14 App Router  (port 3000)
│  └─ mobile/       @umrah-connects/mobile  Expo 54 / RN 0.81      (not at parity)
├─ platform/
│  └─ api/          @umrah-connects/api     NestJS 10 + Prisma 5   (port 4000)
├─ plugins/         10 domain packages (see below)
├─ audit/           Python + Playwright verification suites and evidence
├─ docs/            HANDOFF.md, adr/, migration/ (this directory)
├─ infrastructure/  infra manifests
├─ Dockerfile       production API container (used by Render)
├─ render.yaml      Render blueprint for the API
├─ docker-compose.yml
└─ turbo.json, pnpm-workspace.yaml, tsconfig.base.json
```

Workspace globs: `apps/*`, `platform/*`, `plugins/*`, `integrations/*`, `packages/*`.
(`integrations/` and `packages/` are declared but not currently populated.)

### Domain plugin packages

`booking`, `crm`, `finance`, `group-ops`, `hotel`, `marketplace`,
`pilgrim-portal`, `social`, `transport`, `visa`.

## Frontend — `apps/web`

- **Next.js 14.2** App Router, React 18.3, Tailwind 3.4, TanStack Query 5.
- Axios client at `apps/web/lib/api.ts` points at **`/proxy-api`**, a
  `next.config` rewrite to the API, so web and API are same-origin on any host.
  **Do not replace this with absolute URLs.**
- Auth is JWT (15-minute access + 7-day refresh) held in localStorage. A
  **coalesced refresh singleton** in `lib/api.ts` is shared with
  `components/providers/auth-provider.tsx`. **Never add a second refresh path.**
- All status/enum vocabularies live in `apps/web/lib/statuses.ts`, mirroring the
  Prisma enums. Extend there, never inline — mismatches between this file and
  the database have historically caused 500s.

## Backend — `platform/api`

- **NestJS 10** + **Prisma 5.22** over PostgreSQL.
- **13-schema multiSchema** Prisma setup: `core`, `marketplace`, `social`,
  `audit`, `plugin_crm`, `plugin_booking`, `plugin_hotel`, `plugin_visa`,
  `plugin_transport`, `plugin_finance`, `plugin_group_ops`, `plugin_portal`,
  `plugin_reporting`.
- **No migrations directory** — this is a `prisma db push` workflow.
  `prisma/schema.prisma` is the single source of truth.
- Global route prefix `/api/v1`; Swagger at `/api/docs`.
- App is created with `rawBody: true` so payment webhook signatures can be
  verified against the exact bytes received.
- Money is stored as **BigInt cents** (`*Cents` columns).

### Cross-cutting services

| Concern | Where |
|---|---|
| RBAC | `core.permissions` / `roles` / `role_permissions`, enforced by `PermissionsGuard` via `@RequirePermissions('ns:resource:action')` |
| Audit | `AuditService` → `audit.audit_logs`; failures are logged, never thrown |
| Notifications | `NotificationsService.fire(...)`, server-side only |
| Object storage | `StorageService` — one seam, drivers `local` \| `s3` \| `cloudinary` |
| Payments | `PaymentProvider` interface — drivers `sandbox` \| `stripe` |
| Events | Kafka, **disabled by default** (`KAFKA_ENABLED=false`) |

## Mobile — `apps/mobile`

Expo 54 / React Native 0.81. Present in the workspace but **not at feature
parity** with web. Not required to run the platform locally.

## Local development topology

```
Browser ──▶ http://localhost:3000        Next.js dev (apps/web)
                  │
                  └─ /proxy-api/* ─────▶ http://localhost:4000/api/v1   NestJS (platform/api)
                                                  │
                                                  └──▶ PostgreSQL 15  (local)
```

Redis and Kafka are optional and off by default.

## Roles

Seven: Pilgrim, Umrah Operator/Agency, Hotel, Transport Company, Visa Agency,
Finance Manager, Super Admin. Each tenant has a private CRM workspace;
Marketplace, Social Hub, Connections, Groups, Requests/Offers and Messaging are
shared cross-role areas.
