# Frontend release evidence

Branch `codex/web-frontend-finalization`; worktree `/Users/macbook/Projects/umrah-connects-web-finalization`; baseline `65ce3dce0a53f957cfbcbe3bdb3bcfb9468dbe0d`. Canonical main work and backend/security track files are preserved. No push or deploy.

## Validation

- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS, zero ESLint errors/warnings. Next 14 rules are made compatible with ESLint 9 using @eslint/compat; no rules disabled to hide failures.
- `pnpm test`: PASS, 39 tests in two files (31 contract/auth/access tests and eight component semantic tests). Vitest emits an upstream Vite CommonJS API deprecation notice; tests pass.
- `API_PROXY_ORIGIN=http://localhost:4101 pnpm build`: PASS, Next 14.2.35. Shared first-load JS 87.6 kB; 76 generated static pages. The inventory contains 79 route families, including dynamic families.
- Browser production walkthrough: 79 families × three viewport sizes = 237 final checks; no document/canvas overflow or unnamed controls.
- Console: no error/warning entries reported for the final build walkthrough. Historical development cache/chunk errors are not final-build errors.
- Actual existing operator login/logout, protected booking return path, password visibility, missing-email recovery, missing reset token, signup blur validation, drawers/dialog focus restoration and native FAQ keyboard disclosure verified.

Real API reads use existing compiled canonical API on isolated port 4101. This avoided unavailable 4100 without changing backend source, applying seeds/migrations or interfering with other services. Returned development records remain development evidence, not production user counts/testimonials. No domain write, purchase/payment, external inquiry/newsletter, account-creation, permission grant or password-reset transaction was submitted.

## Performance and network limits

Public informational home renders on the server; real marketplace querying is isolated to its discovery route. Removed fake panels and duplicate helpers; shared query errors avoid a broad query-cache subscription. Avatars load lazily through Next Image with failure fallback; listing images use lazy loading. Auth refresh calls are coalesced. Public unauthenticated 401s do not trigger refresh loops. No architecture or backend churn.

Build route bundle output is preserved. Performance timing/Lighthouse, device profiling, layout-shift scores and complete browser network waterfalls were not available through the browser interface. Network validation is limited to actual API-backed rendered results/failures, frontend contract inspection and local runtime responses. No claim of full network or performance certification.

## Artifacts

- [Inventory](ROUTE_INVENTORY.md), [design system](FINAL_DESIGN_SYSTEM.md), [components](IMPLEMENTED_COMPONENT_SYSTEM.md).
- [Completion matrix](ROUTE_UI_COMPLETION_MATRIX.md), [backend dependencies](BACKEND_DEPENDENCIES.md).
- [Responsive QA](RESPONSIVE_QA.md), [accessibility QA](ACCESSIBILITY_QA.md).
- [QA summary](release-evidence/qa-summary.json), [final observations](release-evidence/final-route-checks.json), [interactions](release-evidence/interaction-checks.json), [console](release-evidence/console-checks.json), [build log](release-evidence/production-build.log).
- [Frontend files changed](release-evidence/frontend-files-changed.json): 106 source/config/test paths. pnpm-lock.yaml changes only add the lint compatibility dependency.

Every screenshot is an original browser capture. Discovery image-generation mockups remain separate historical concepts. No generated image stands in for runtime evidence.

## Gate

BLOCKED. Implemented frontend read/recovery UX is reviewable, but trustworthy booking price validation, account role provisioning, server platform-admin scope and genuine role-specific/transaction acceptance remain unresolved. This gate is deliberately stricter than compilation or screenshot success. Native mobile is excluded.
