# Code audit checklist (use for every API change)

- [ ] Route has exactly one policy (`@RequirePermissions` / `@AnyAuthenticated` + ownership / `@Public`)
- [ ] Capability exists in `catalog.ts` and is granted to the right system roles
- [ ] Tenant from the principal; every client id resolved with `tenant-scope.ts`
- [ ] Body/query are DTO classes; enums, lengths, ranges, UUIDs validated; server-owned fields excluded; JSON fields `@RawJson()`
- [ ] Unknown vs foreign ids give identical 404s; no existence leaks via 400/403
- [ ] Money/status/counters computed or transitioned on the server; multi-row writes in a transaction
- [ ] Public routes: minimal fields, throttled if they write
- [ ] No secrets/tokens in logs or responses; errors are Nest exceptions
- [ ] Files through `StorageService`; private files only via `DocumentAccessService`
- [ ] Schema change is a reviewed migration; no `db push`
- [ ] Privileged actions write an audit row
- [ ] Regression test added; typecheck, lint, unit, e2e green
