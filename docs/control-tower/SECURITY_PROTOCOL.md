# Security Protocol — rules for every change to the API

1. **Tenant scope comes from the principal only.** Use `@TenantId()` / `@CurrentUser()`. A body, query or path value is never a tenant or an owner.
2. **Every client-supplied id goes through `src/common/tenant-scope.ts`** (`findOwned`, `assertOwnedIfPresent`, `assertAllOwned`, `requireId`). Unknown and foreign ids get the same 404. Never call `findFirst({ where: { id } })` with an unvalidated id.
3. **Every route declares exactly one policy:** `@RequirePermissions(<catalogue key>)`, or `@AnyAuthenticated()` with ownership enforced in the service, or `@Public()`. The build fails on unknown capabilities and the API refuses to boot on missing policies.
4. **New capabilities are added to `src/modules/rbac/catalog.ts`**, with a description and role assignments. `platform:*` capabilities go only to `SUPER_ADMIN`.
5. **Every mutation body is a class-validator DTO.** No `any` or inline bodies. Server-owned fields (tenant, creator, status transitions, money totals, counters, payment state) are never client-settable. Free-form JSON fields use `@RawJson()`.
6. **Money is computed on the server.** Payment state changes only from provider truth: webhooks or a server-side retrieve.
7. **Files are stored through `StorageService`.** Content is sniffed. Private files are read only through `DocumentAccessService` (audited, signed, short-lived).
8. **Never log secrets, tokens, reset links or passwords.** One-time tokens are random, hashed at rest and single-use.
9. **Errors are Nest HTTP exceptions.** The global filter hides internals and adds the request id.
10. **Schema changes are migrations** (`prisma migrate dev --create-only`, reviewed, additive where possible). Never `db push` or `migrate reset` outside disposable databases.
11. **Every security fix ships with a regression test** in `platform/api/test/*.e2e-spec.ts` (or a unit test).
12. **Before merging:** `pnpm --filter @umrah-connects/api typecheck && pnpm --filter @umrah-connects/api lint && pnpm --filter @umrah-connects/api exec vitest run && pnpm --filter @umrah-connects/api exec vitest run --config vitest.e2e.config.ts`.
13. **Secrets:** only `*.example` templates are committed. `.env*` files are ignored at every depth and excluded from Docker builds. Production reads the process environment only.
14. **Incident first steps:** force-logout the affected users (`POST /admin/users/:id/force-logout`), suspend the organization if needed (`PUT /admin/tenants/:id/status`), rotate `JWT_SECRET` (which invalidates all access tokens and OAuth/download links), and preserve the audit log (`GET /admin/audit-logs`).
