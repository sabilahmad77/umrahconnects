# Verification

How to reproduce the evidence behind the web integration closure loop, from the
canonical repository.

## Workspace

```bash
cd /Users/macbook/Projects/umrah-connects
bash scripts/verify-workspace.sh
git worktree list          # integration/web-final at umrah-connects-integration
```

## Database

```bash
cd platform/api
npx prisma migrate deploy
npx ts-node prisma/scripts/sync-rbac.ts
npx ts-node prisma/seed.ts                      # operator tenants
npx ts-node prisma/seed-modules.ts              # hotels, vehicles, visas, invoices
npx ts-node prisma/seed-marketplace.ts          # vendors and listings
npx ts-node prisma/scripts/seed-demo-roles.ts   # one account per role (A side)
npx ts-node prisma/scripts/seed-isolation-pairs.ts  # second organization per type (B side)
```

## Static checks and tests

```bash
cd platform/api && npx tsc --noEmit && pnpm lint
npx vitest run                                        # unit 19
TEST_DATABASE_URL=...   npx vitest run --config vitest.e2e.config.ts   # e2e 146
cd ../../apps/web && npx tsc --noEmit && npx eslint app components hooks lib middleware.ts
npx vitest run                                        # web 58
```

`apps/web/tests/server-contracts.test.ts` reads the Prisma enums and the server
DTOs at test time, so a backend enum or password-rule change that is not mirrored
on the web fails here rather than in front of a user.

## Builds

```bash
cd platform/api && pnpm build
cd ../../apps/web && API_PROXY_ORIGIN=http://localhost:4300 pnpm build
# and the guard:
cd apps/web && env -u API_PROXY_ORIGIN VERCEL=1 npx next build   # must exit 1
```

## Runtime

Start the API and the web app (launch configurations "Integration API
(integration/web-final :4300)" and "Integration Web (integration/web-final
:3300)"), then:

```bash
python3 audit/core_runtime_qa.py http://localhost:3300 docs/control-tower/evidence/integration-runtime-qa.json
python3 audit/integration_acceptance_qa.py http://localhost:3300 docs/control-tower/evidence/integration-acceptance-qa.json
```

Expect 65/65 and 210/210. Both exit non-zero if any check fails.

Note on rate limiting: the acceptance harness signs in fifteen identities and
registers several accounts, so with throttling enabled one probe (the
logout-all revocation check) is skipped when it meets the registration limit —
hence 210 rather than 211. That behaviour is covered independently by the
`auth.e2e-spec.ts` regression test. Running the harness with
`THROTTLE_DISABLED=true` gives the full 211.
