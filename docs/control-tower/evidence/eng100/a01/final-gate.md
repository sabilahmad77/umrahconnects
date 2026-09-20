== Final gate — integrated candidate 53cce97, 2026-09-21 01:44 +0500

| Gate | Command | Result |
|---|---|---|
| API typecheck | `platform/api$ npx tsc --noEmit` | exit 0 |
| API lint | `platform/api$ pnpm lint` | exit 0 |
| API unit | `platform/api$ npx vitest run` | 18 files, 201 passed |
| API e2e (app as the non-superuser runtime role, RLS enforced; stripe-mock running) | `TEST_DATABASE_URL=… STRIPE_MOCK_URL=… npx vitest run --config vitest.e2e.config.ts` | **37 files, 522 passed, 0 skipped, 0 failed** |
| Provider integration (MinIO + Mailpit + stripe-mock, required mode) | `PROVIDER_TESTS_REQUIRED=true … npx vitest run --config vitest.providers.config.ts` | 4 files, 12 passed |
| Web typecheck | `apps/web$ npx tsc --noEmit` | exit 0 |
| Web lint | `apps/web$ npx eslint app components hooks lib middleware.ts` | exit 0 |
| Web tests | `apps/web$ npx vitest run` | 20 files, 239 passed |
| API build | `npx nest build` | exit 0 |
| Web production build | `NODE_ENV=production API_PROXY_ORIGIN=… npx next build` | exit 0; 0 files containing `onrender` |
| Cold boot from the built artifacts | preview servers restarted on the new build | API `{"status":"ok","service":"umrah-connect-api","release":"unknown","db":"connected","uptime"…`; web /login 200 |
| Database role of the running API | `select usename …` | uc_int_app  (non-superuser runtime role) |

Raw logs: gate-api-static.txt, gate-e2e-final.txt, gate-providers.txt, build-api-final.txt, build-web-final.txt (session scratchpad a01/).
