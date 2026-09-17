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
