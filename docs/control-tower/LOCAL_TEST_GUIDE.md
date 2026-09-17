# Local Test Guide (core track)

## Workspaces and ports

| Worktree | Branch | API | Web | Database |
|---|---|---|---|---|
| `/Users/macbook/Projects/umrah-connects` | `main` | :4100 | :3000 | `umrah_connects` |
| `/Users/macbook/Projects/umrah-connects-core-finalization` | `claude/core-finalization` | :4200 | :3200 | `umrah_connects_core` |
| `/Users/macbook/Projects/umrah-connects-web-finalization` | `codex/web-frontend-finalization` | (Codex uses :4101) | — | — |
| e2e suite | — | in-process | — | `umrah_connects_test` (reset on every run; the name must end in `_test`) |

Launch configurations (Claude desktop preview): "Core API (claude/core-finalization worktree :4200)" and "Core Web (claude/core-finalization worktree :3200)".
Worktree overrides (gitignored): `platform/api/.env.local` (`PORT=4200`, core `DATABASE_URL`) and `apps/web/.env.development.local` (`API_PROXY_ORIGIN=http://localhost:4200`).

## Database

```bash
cd platform/api
npx prisma migrate status
npx prisma migrate deploy                       # apply committed migrations
npx ts-node prisma/scripts/sync-rbac.ts         # catalogue + legacy role migration (idempotent)
npx ts-node prisma/scripts/seed-demo-roles.ts   # one account per role (development only)
```

## Tests

```bash
cd platform/api
npx tsc --noEmit
pnpm lint
npx vitest run                                          # unit
npx vitest run --config vitest.e2e.config.ts            # e2e security suites
```

Provider integration (local stand-ins):

```bash
docker run -d --rm --name uc-stripe-mock -p 127.0.0.1:12111:12111 stripe/stripe-mock:latest
docker run -d --rm --name uc-minio -p 127.0.0.1:19000:9000 -e MINIO_ROOT_USER=ucminioadmin -e MINIO_ROOT_PASSWORD=ucminiosecret123 minio/minio:latest server /data
docker run -d --rm --name uc-mailpit -p 127.0.0.1:11025:1025 -p 127.0.0.1:18025:8025 -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 axllent/mailpit:latest
```

```bash
STRIPE_MOCK_URL=http://127.0.0.1:12111 S3_TEST_ENDPOINT=http://127.0.0.1:19000 S3_TEST_ACCESS_KEY=ucminioadmin S3_TEST_SECRET_KEY=ucminiosecret123 SMTP_TEST_HOST=127.0.0.1 SMTP_TEST_PORT=11025 SMTP_TEST_API=http://127.0.0.1:18025 npx vitest run --config vitest.providers.config.ts
```

```bash
docker stop uc-stripe-mock uc-minio uc-mailpit
```

Runtime QA against the running stack (goes through the web proxy):

```bash
python3 audit/core_runtime_qa.py http://localhost:3200 docs/control-tower/evidence/core-runtime-qa.json
```

## Notes

- The legacy `audit/bp07_admin.py` exercised Super Admin actions with an operator account. It now fails by design (AUD-002 fixed) and is superseded by `test/rbac.e2e-spec.ts`. `audit/bp09_payments.py` pays a newly created invoice without issuing it first; invoices now start DRAFT.
- Do not run `next build` or `nest build` in a worktree whose dev server is running (shared `.next`/`dist`).
