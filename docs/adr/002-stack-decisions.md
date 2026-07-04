# ADR-002: Stack Decisions

**Status**: Accepted  
**Date**: 2026-05-03  
**Deciders**: Sabil Ahmad (CTO)

## Decisions

### Monorepo: Turborepo + pnpm workspaces
- Turborepo for task orchestration and build caching.
- pnpm for package management (faster, correct hoisting, disk efficient).
- Alternatives rejected: Nx (heavier config), Lerna (legacy).

### Frontend: Next.js 14 App Router
- SSR for marketing pages and public vendor profiles (SEO).
- CSR for authenticated operator dashboards.
- `next-intl` for i18n; RTL confirmed via Tailwind `dir="rtl"` and Noto Sans Arabic.

### Backend: NestJS (Node.js)
- Product document explicitly names NestJS.
- Modular architecture maps cleanly to the plugin model.
- TypeScript end-to-end with shared types via `@umrah-connects/shared-types`.

### ORM: Prisma
- Strong TypeScript DX, automated migrations, Prisma Studio for dev.
- Multi-schema support (`previewFeatures = ["multiSchema"]`) enables plugin schema namespacing.
- Alternative (Drizzle): faster queries, but less mature tooling for schema migrations at this complexity.
- Alternative (TypeORM): selected against — decorator-heavy, less type-safe at complex query level.

### Mobile: React Native + Expo
- Code and type reuse with the Next.js web stack.
- Shared TypeScript interfaces via `@umrah-connects/shared-types`.
- Expo for OTA updates and simplified build tooling.
- Flutter rejected: no existing team expertise; separate Dart codebase from web stack.
- Phase 1 delivers web-first; mobile scaffolded and shipped in Phase 2.

### Database: PostgreSQL 16 + no MongoDB
- Product doc proposed MongoDB for OCR/document metadata. Rejected.
- PostgreSQL JSONB handles all flexible schema requirements without adding a second database engine.
- Reduces operational complexity significantly.

### Event bus: Apache Kafka (Confluent Cloud in production, local KRaft in dev)
- Kafka chosen for immutable audit log (infinite retention) and future analytics pipelines.
- AWS MSK is the fallback if Confluent pricing is prohibitive.
- SQS used for simple job queues (notifications, email) where ordering doesn't matter.

### Auth: JWT (NestJS Passport) + NextAuth v5
- Access token: 15 min, RS256. Refresh token: 7 days, rotated on use, hashed in DB.
- Keycloak optional for Phase 3 enterprise SSO/SAML.
- Phone OTP: SHA-256 hashed, 6-digit, 10-min TTL, max 5 attempts.

### CI/CD: GitHub Actions
- TypeScript → Lint → Test → Integration Test → Build → Deploy pipeline.
- Branch protection: all checks required on `main`.
- Deployment: AWS ECS (Phase 1), Kubernetes via EKS (Phase 2+).

### Observability: OpenTelemetry + Datadog
- OTel SDK across all services; traces, logs, metrics correlated by `request_id`.
- Sentry for client-side error tracking.
- PagerDuty for on-call escalation.

### Primary AWS Region: me-central-1 (UAE)
- Year 1: UAE for proximity to Saudi and low-latency to GCC operators.
- Year 2: Migrate or replicate to KSA (stc cloud / Google Cloud Dammam) for PDPL compliance.
- Indonesia: `ap-southeast-3` (Jakarta) replica for Indonesian pilgrim PII per UU PDP.
