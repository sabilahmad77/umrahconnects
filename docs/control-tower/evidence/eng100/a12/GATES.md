# A12 — mandatory gates, re-run independently

Candidate: `engineering/100-loop` @ `2e3857b` ("fix(web): close the three open defects from A10's browser QA").
Worktree `…/eng100/a12`, branch `eng100/a12` branched from that commit. Dev DB `umrah_eng100_a12`
(API connects as the non-superuser runtime role `uc_int_app`, RLS live), e2e DB `umrah_eng100_a12_test`.
Every number below was produced by the command shown, in this worktree, by A12 — none was copied
from another worker's report. Raw output: `gate-logs/`.

| # | Gate | Command (cwd) | Result |
|---|---|---|---|
| 1 | API typecheck | `platform/api$ npx tsc --noEmit` | **PASS** — exit 0, no output (`gate-logs/api-tsc.txt`) |
| 2 | API lint | `platform/api$ pnpm lint` (`eslint .`) | **PASS** — exit 0, no findings (`gate-logs/api-lint.txt`) |
| 3 | API unit | `platform/api$ npx vitest run` | **PASS** — 18 files, **199/199** (`gate-logs/api-unit.txt`) |
| 4 | API e2e, FULL, runtime role | `platform/api$ set -a; . ./.env.test-db; set +a; npx vitest run --config vitest.e2e.config.ts` | **PASS** — exit 0, 34 files passed + 1 skipped, **494 passed / 5 skipped (499)**, 164 s (`gate-logs/api-e2e-full.txt`) |
| 4b | the 5 skipped tests, un-skipped | `docker run -d -p 12412:12111 stripe/stripe-mock` then `STRIPE_MOCK_URL=http://127.0.0.1:12412 npx vitest run --config vitest.e2e.config.ts test/payments-stripe-mock.e2e-spec.ts` | **PASS** — **5/5** against Stripe's own OpenAPI mock (`gate-logs/stripe-mock-suite.txt`). stripe-mock is NOT Stripe: T04 stays unverified. |
| 5 | Web typecheck | `apps/web$ npx tsc --noEmit` | **PASS** — exit 0, no output (`gate-logs/web-tsc.txt`) |
| 6 | Web lint | `apps/web$ npx eslint app components hooks lib middleware.ts` | **PASS** — exit 0, no findings (`gate-logs/web-eslint.txt`) |
| 7 | Web unit | `apps/web$ npx vitest run` | **PASS** — 20 files, **233/233** (`gate-logs/web-vitest.txt`) |
| 8 | API production build | `platform/api$ npx nest build` | **PASS** — exit 0, `dist/src/main.js` present, 5.9 MB (`gate-logs/api-build.txt`) |
| 9 | Web production build | `apps/web$ API_PROXY_ORIGIN=http://127.0.0.1:4413 PROXY_SHARED_SECRET=… npx next build` | **PASS** — exit 0, all routes compiled, middleware 26.4 kB, `.next` 328 MB (`gate-logs/web-build.txt`) |
| 10 | Cold boot (built artifacts) | see "Cold boot" below | **PASS** |
| 11 | Migration validation | see "Migrations" below | **PASS** — zero drift, no destructive statement |
| 12 | Secret scan | `gate-logs/secret-scan.txt` | **PASS** — no provider credential anywhere, including `dist/` and `.next/` |

## Cold boot from the built artifacts (ports 4413 / 3413, owned by A12)

1. `platform/api$ NODE_ENV=production PORT=4413 node dist/src/main` → **refused to start**, by design:

   ```
   Error: Refusing to start with unsafe production configuration:
     - WEB_URL must be an https:// URL
     - PAYMENT_PROVIDER=sandbox is not allowed in production
     - STORAGE_DRIVER=local requires STORAGE_LOCAL_PERSISTENT=true (a persistent volume) in production
     - MAIL_DRIVER=log is not allowed in production
   ```

   This is a real production-readiness guard working on the shipped artifact, not a failure.

2. `platform/api$ PORT=4413 node dist/src/main` (local configuration) → started in ~3 s:
   `Access policy OK — 358 routes; catalogue synced (58 capabilities, 8 system roles)`,
   `Umrah Connect API listening on 0.0.0.0:4413 (prefix /api/v1, env development)`.
3. `GET /api/v1/health/ready` → **HTTP 200** `{"status":"ready","rowLevelSecurity":"enforced",…}`.
4. Sign-in with a QA fixture (`traveler@umrahconnect.dev`) → **HTTP 200**; body carries `accessToken`
   + `expiresIn` only; the refresh token arrives solely as an `HttpOnly; SameSite=Lax` cookie; no
   password hash, MFA secret or token hash anywhere in the response.
5. Authenticated routes on the cold-booted API: `/auth/me` 200, `/rbac/my-permissions` 200,
   `/travelers/me/trips` 200, `/admin/tenants` **403**, `/pilgrims` **403** — capability gating alive
   in the built artifact.
6. `apps/web$ npx next start -p 3413 -H 127.0.0.1` with `API_PROXY_ORIGIN=http://127.0.0.1:4413` →
   ready in 328 ms; `/`, `/login`, `/dashboard` all 200; `GET /proxy-api/health/ready` → 200 through
   the same-origin rewrite; `POST /proxy-api/auth/login` → 200. All nine browser probes below ran
   against this cold-booted pair.
7. Both processes stopped by the PIDs A12 started (`coldboot-api.pid`, `coldboot-web.pid`).

## Migrations

Ten migration folders, `20260917000000_baseline` … `20260918190000_listing_moderation`.

| Check | Command | Result |
|---|---|---|
| Apply to a fresh empty database | `createdb umrah_eng100_a12_migcheck` then `DATABASE_URL="postgresql://macbook@…/umrah_eng100_a12_migcheck" npx prisma migrate deploy` (owner URL) | **PASS** — all 10 applied, exit 0 |
| Migrations == database | `npx prisma migrate diff --from-migrations prisma/migrations --to-url <fresh db> --shadow-database-url <shadow> --exit-code` | **PASS** — `No difference detected.`, exit 0 |
| Database == datamodel (no drift) | `npx prisma migrate diff --from-url <fresh db> --to-schema-datamodel prisma/schema.prisma --exit-code` | **PASS** — `No difference detected.`, exit 0 |
| Destructive statements | `grep -rniE "DROP (TABLE|SCHEMA|COLUMN)|TRUNCATE|DELETE FROM|DROP CONSTRAINT|SET NOT NULL"` over all ten `migration.sql` | **PASS** — none. Every `NOT NULL` is inside a `CREATE TABLE` or carries a `DEFAULT`. The only data statements are forward-fills (`UPDATE` of derived counters, listing city, moderation status) and one `REVOKE UPDATE, DELETE ON audit.audit_logs FROM uc_app_runtime` (tightening, by design). |

Note on method: `--from-migrations … --to-schema-datamodel` (the form named in the task) produces a
spurious full add/remove of every table on this multi-schema project — it lists each table as added
**and** removed **and** changed, which is a rendering artifact of the shadow-database comparison, not
drift. The two directed comparisons above pin the same property transitively and both exit 0.

## Secret scan

`gate-logs/secret-scan.txt` — 4 278 files across the working tree, `platform/api/dist/`, `apps/web/.next/`,
`docs/control-tower/evidence/` and `audit/`. Patterns: GitHub classic + fine-grained PATs, Render keys,
Stripe live/test secret + publishable + webhook secrets, AWS access-key ids and secrets, PEM private
keys, Google API keys and `GOCSPX-` client secrets, Slack tokens, npm tokens, JWTs, and Postgres URLs
carrying a password.

* GitHub / Render / Stripe / AWS / private-key / Google / Slack / npm / JWT patterns: **zero hits**,
  in every target including the two build outputs.
* Eight Postgres URLs with an inline password, reported by fingerprint only:

  | Fingerprint | File | Assessment |
  |---|---|---|
  | `sha256:174bd509ceaa`, `sha256:7948462ac6f3`, `sha256:bf5189109601` | `platform/api/src/bootstrap/env.validation.spec.ts` | test fixtures that assert the config validator rejects Render-hosted databases |
  | `sha256:1f43c10a5367` | `infrastructure/kvm/README.md` | documentation example (`umrah:…@uc-postgres`) |
  | `sha256:66d03cc9b256` | `platform/api/.env.example` | example file |
  | `sha256:963fe2a64975` | `.env.docker.example` | example file |
  | `sha256:bbbb679905e8` | `.github/workflows/api-ci.yml` | the CI service container's throwaway password |
  | `sha256:22760110300e` | `platform/api/.env` | this worktree's local runtime role. **Untracked and gitignored** (`git check-ignore` → `.gitignore:14`, `git ls-files` → not known to git). Never leaves the machine. |

  No value is reproduced here or anywhere in this evidence directory.
