# Verification — how to re-prove this baseline

```bash
cd /Users/macbook/Projects/umrah-connects-core-finalization
UC_ALLOW_WORKTREE=1 scripts/verify-workspace.sh
cd platform/api
npx tsc --noEmit && pnpm lint
npx vitest run
npx vitest run --config vitest.e2e.config.ts
npx prisma migrate status
cd ../.. && docker build -t umrah-connect-api:verify .
python3 audit/core_runtime_qa.py http://localhost:3200    # with the core API/web running
```

Expected: typecheck and lint clean; 19 unit tests; 145 e2e tests; migrations up to date; image builds; runtime QA 65/65. Provider suites: see LOCAL_TEST_GUIDE.md. Latest outputs are in `evidence/`.
