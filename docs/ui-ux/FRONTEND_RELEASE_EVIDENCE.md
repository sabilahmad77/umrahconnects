# Frontend acceptance release evidence

Completed locally at 2026-09-17T21:43:06.850666+00:00. This supersedes the earlier 4101 backend snapshot and earlier finalization gate; historical evidence remains in its original directories. Current acceptance artifacts are in `acceptance-evidence/`.

Canonical `/Users/macbook/Projects/umrah-connects`, main `65ce3dce0a53f957cfbcbe3bdb3bcfb9468dbe0d`; user pre-existing .claude launch configuration and untracked project/control-tower/UI/scripts preserved. Dedicated frontend worktree `/Users/macbook/Projects/umrah-connects-web-finalization`, branch `codex/web-frontend-finalization`, baseline HEAD `91ad20d2c98e0c709ce0c56cf2f812baa998cbfd`; acceptance changes remain local and uncommitted. Backend read-only worktree `claude/core-finalization`, HEAD `83bc3d52b3a282068cb984d0b605ecaea5b0d9e6`, clean on final ownership check.

Build/run reproducibly from the frontend worktree:

```sh
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web test
API_PROXY_ORIGIN=http://localhost:4201 pnpm --dir apps/web build
API_PROXY_ORIGIN=http://localhost:4201 pnpm --dir apps/web exec next start -p 3107
```

Current backend is its existing compiled runtime started on isolated port 4201 with the existing isolated local database. No backend source edits, backend build/migrations/seeding or production configuration changes. Local dev HTTP refresh cookies are HttpOnly; production backend cookie contract remains backend-owned. Frontend cookie refresh/logout sends {} with credentials; access/capabilities come from real /auth/me; no fabricated personas or stored refresh token.

Checks: typecheck PASS; lint PASS; 45 tests in four files PASS; production build PASS; browser route/role smoke PASS for observed states. Test scope: transaction/pricing/status shapes, session contracts, component semantics and regression for actual read-only platform-settings response. Browser walk-through is separate evidence, not an automated Playwright suite. No end-to-end financial/provider/credential-change/KYC success claimed.

Build shared first-load JS 87.7kB; homepage first-load 131kB. Stripe form is lazy loaded for eligible configured card flows; no global SDK script on landing. Refresh requests are coalesced; payment polling is bounded; no broad new chart/animation dependency. Optimized hero slot reserves dimensions and responsive sizes; exact image weight cannot be measured before approved asset exists. No formal Lighthouse/Core Web Vitals certification was run.

Runtime evidence:

- `api-route-inventory.json`: 325 current runtime-mapped route patterns extracted without retaining mail/credential log contents.
- `current-api-checks.json`: 71 safe checks across all eight real account roles, current endpoints, denial, cookie refresh/logout, pricing mismatch and auth recovery validation.
- `signup-provisioning.json`: one normal real local signup 201; authoritative PILGRIM access and unverified organization-create 403 before write.
- `credential-session-checks.json`: invalid password validation 400/401, QA logout-all 200, revoked old access/refresh 401; no password changed.
- `proxy-document-settings-checks.json`: real same-origin proxy and current enforced platform settings; signed-file metadata fixture has explicit no-upload 404.
- `profile-persistence.json`: temporary Bio saved and persisted after reload, restored and verified empty; nationality padding normalization saved and reloaded correctly.
- `route-inventory.json`, `route-plan.json`, `route-checks.json`, `final-route-checks.json`: all current route/role/viewport coverage and native images.
- `interaction-checks.json`: actual dialog focus and keyboard tabs.
- `final-console.json`: final tabs have zero warnings/errors; earlier stale settings crash recorded as fixed, with regression test.
- `network-smoke.json`: all 27 observed homepage asset/public route HTTP checks returned 200. Auth/ownership denial and no-file 404 remain expected backend results; no full HAR capture claimed.
- `typecheck.log`, `lint.log`, `tests.log`, `build.log`: final check outputs.

QA effects: one retained unverified Traveler account in isolated community tenant; no manual roles/organizations created; temporary profile field restored; QA-account sessions revoked; temporary credential file removed. Existing local backend fixtures such as sandbox payment rows and organization names containing “demo” are authentic API fixture data, not frontend-injected production data. No purchase/refund/password-change or KYC document mutation was submitted by browser QA. Local audit/auth logging is expected.

No push, deployment, production, infrastructure or mobile action. Frontend review preview remains at http://localhost:3107/ while the local process is running. Backend/configuration and positive fixture limits are recorded rather than hidden.
