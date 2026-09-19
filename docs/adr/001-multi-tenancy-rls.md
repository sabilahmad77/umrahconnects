# ADR-001: Multi-Tenancy via PostgreSQL Row-Level Security

**Status**: Accepted  
**Date**: 2026-05-03  
**Deciders**: Sabil Ahmad (CTO)

## Context

Umrah Connects must isolate data between operator tenants (Indonesian PPIUs, Saudi mu'assasat, Pakistani operators, etc.) within a single database cluster. Three patterns were evaluated:

1. **Database-per-tenant**: Full isolation, but operationally expensive at 1,000+ tenants.
2. **Schema-per-tenant**: Moderate isolation, migration tooling complexity grows with tenant count.
3. **Shared schema with Row-Level Security (RLS)**: Single database, PostgreSQL RLS enforces isolation at the data layer.

## Decision

**Use shared schema with PostgreSQL 16 RLS** for all tenant-scoped tables.

- Every tenant-scoped table has a non-null `tenant_id UUID` column.
- RLS policies read `current_setting('app.current_tenant_id')`, set on every request by the tenant-context middleware.
- The `PrismaService.setTenantContext()` method issues `SET LOCAL "app.current_tenant_id" = '{id}'` inside every transaction.
- Red-team tests explicitly attempt cross-tenant reads at every API layer.

## Consequences

**Positive**:
- Simple to operate: one database, one schema, standard migration tooling.
- Enforceable at the database layer — a bug in application code cannot leak cross-tenant data without also defeating the RLS policy.
- Suitable for target scale (1,000 tenants × 500K pilgrims).

**Negative**:
- RLS adds ~5-10% query overhead per row scan. Acceptable at this scale.
- Enterprise tenants requiring physical isolation must wait until Phase 3 (sovereign deployment with dedicated cluster).
- Schema-per-tenant and database-per-tenant are explicitly rejected and must not be introduced without CTO approval.

---

## Amendment — 2026-09-17 (core finalization loop)

**Status of the original decision: not implemented.** Row-Level Security was never enabled on any table (`pg_class.relrowsecurity = false` everywhere), and `setTenantContext()` was never called (audit finding AUD-041). Isolation has always depended on per-query tenant filters, which is how AUD-003 (hotels) and the SEC-0xx findings happened.

**Decision for launch:** tenant isolation is enforced in the service layer, with guard rails that make omissions visible:

1. The tenant is taken only from the verified principal (`@TenantId()`), never from request bodies.
2. Every client-supplied id is resolved inside the caller's tenant (`src/common/tenant-scope.ts`), and unknown and foreign ids get the same 404.
3. Capabilities are declared per route and checked server-side, deny-by-default; the API refuses to boot if a route has no policy.
4. Automated cross-tenant tests (`platform/api/test/*.e2e-spec.ts`) attack every tenant-owned domain.

The dead `setTenantContext` / `withTenant` helpers were removed so nothing suggests a protection that does not exist.

**RLS remains the intended defence in depth**, deferred to a dedicated loop. It needs: a non-owner application role, `FORCE ROW LEVEL SECURITY`, every query in a transaction with `SET LOCAL app.current_tenant_id`, explicit policies for the shared rows (community organization, shared hotels, marketplace), and a bypass role for platform administration and migrations. Enabling it partially would give false assurance.

---

## Amendment — 2026-09-19 (Engineering 100, R05 / A08)

**RLS is now implemented as defence in depth**, with exactly the prerequisites listed
above; the service-layer isolation stays in force. Details, the table-by-table policy
list and the tables deliberately left without RLS: `docs/control-tower/RLS.md`.

1. **Non-owner application role.** The API connects as a LOGIN member of
   `uc_app_runtime` (NOSUPERUSER, NOBYPASSRLS, owns nothing; `prisma/rls/runtime-role.sql`).
   Migrations and seeds run as the owner (`MIGRATE_DATABASE_URL`), which is the bypass
   role for migrations; platform administration does NOT bypass — it has its own
   read-mostly `platform` policies.
2. **FORCE ROW LEVEL SECURITY** on every protected table (migration
   `20260918180000_rls_defence_in_depth`).
3. **Every query in a transaction with transaction-local settings.** `PrismaService`
   wraps each operation that can reach a protected table in a transaction that first runs
   `set_config('app.scope' | 'app.tenant_id' | 'app.user_id', …, true)` (the original
   `app.current_tenant_id` name became `app.tenant_id`, plus a scope and a user id).
   Interactive/batch transactions are scoped once at their start. No settings ⇒ no rows.
4. **Explicit policies for shared rows.** The traveler community is never sent as a
   tenant; shared marketplace hotels have a read-only shared policy; per-user rows have an
   owner policy; public/two-party/community tables are recorded as unprotected with reasons.
5. **Scopes.** `tenant` (principal), `platform` (Super Admin oversight: read + KYC review),
   `system` (only through `withSystemScope(reason)` with a closed list of reasons).
6. **Proof.** `test/rls.e2e-spec.ts` plus the whole e2e suite run with the API connected
   as the runtime role; a catalogue test fails if a table is added without a decision.

PostgreSQL 15 locally / 16 on KVM (the original "PostgreSQL 16" wording is not required
by the design).
