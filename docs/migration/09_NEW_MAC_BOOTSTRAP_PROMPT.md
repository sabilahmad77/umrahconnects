# 09 — New Mac Bootstrap Prompt

Paste everything inside the fence below into Claude Code on the new Mac.
It is self-contained and does not depend on any earlier conversation.

---

```text
UMRAH CONNECT — NEW MAC BOOTSTRAP AND VERIFICATION

You are setting up an existing, production-deployed project on a fresh MacBook.
This is an EXECUTION task. Do not stop after analysis, do not hand me a plan and
wait, and do not ask me to run commands you can run yourself. Work through to the
end and report with evidence.

Do NOT create a new GitHub repository. Do NOT change the remote. Do NOT refactor,
upgrade or redesign anything. This is a reproduction task: bring the existing
project up on this machine exactly as it is.

────────────────────────────────────────────────────────
PROJECT IDENTITY
────────────────────────────────────────────────────────
Name:            Umrah Connect  (brand is exactly "Umrah Connect"; only the
                 repo slug keeps the trailing s)
GitHub:          https://github.com/sabilahmad77/umrahconnects   (PUBLIC)
GitHub account:  sabilahmad77
Branch:          main
Local path:      ~/Projects/umrah-connects
Live web:        https://umrahconnect.io          (Vercel, auto-deploys from main)
Live API:        https://umrah-connect-api.onrender.com/api/v1  (Render, auto-deploys from main)

Monorepo: pnpm workspaces + Turborepo.
  apps/web        @umrah-connects/web     Next.js 14 App Router   port 3000
  platform/api    @umrah-connects/api     NestJS 10 + Prisma 5    port 4000
  apps/mobile     @umrah-connects/mobile  Expo 54 (NOT at parity, optional)
  plugins/*       10 domain packages
  audit/          Python + Playwright verification suites (own package.json,
                  NOT part of the pnpm workspace)
  docs/migration/ full migration documentation — read it if anything is unclear

Read docs/migration/01..08 after cloning. docs/HANDOFF.md has the deeper product
context. IMPLEMENTATION_LOG.md is the authoritative record of what is already
verified — do not redo or re-audit completed items.

────────────────────────────────────────────────────────
STEP 1 — VERIFY GITHUB ACCESS
────────────────────────────────────────────────────────
Run: gh auth status
Must be logged in as sabilahmad77. If not, run `gh auth login` and tell me to
complete the browser flow, then continue.
Also confirm git can reach the remote. Do not create or switch repositories.

────────────────────────────────────────────────────────
STEP 2 — INSTALL PREREQUISITES (install anything missing yourself)
────────────────────────────────────────────────────────
Required:
  Homebrew
  Git
  GitHub CLI (gh)
  Node.js >= 20            (repo engines require >=20; old Mac ran v20.20.2)
  pnpm 9.12.0 exactly      (package.json pins packageManager: pnpm@9.12.0)
     -> corepack enable && corepack prepare pnpm@9.12.0 --activate
  PostgreSQL 15            -> brew install postgresql@15
  Python 3 with `requests` -> pip3 install --user requests
  Google Chrome            (the browser proof scripts drive the SYSTEM Chrome at
                            /Applications/Google Chrome.app/Contents/MacOS/Google Chrome)

NOT required for local development: Docker, Redis, Kafka, Xcode, Android SDK.

If node@20 is keg-only, add it to PATH in ~/.zshrc.

────────────────────────────────────────────────────────
STEP 3 — CLONE
────────────────────────────────────────────────────────
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/sabilahmad77/umrahconnects.git umrah-connects
cd umrah-connects
git checkout main
git log --oneline -3        # report the HEAD SHA back to me

────────────────────────────────────────────────────────
STEP 4 — POSTGRESQL (check the port before assuming)
────────────────────────────────────────────────────────
brew services start postgresql@15
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

CRITICAL: before using port 5432, check that nothing else owns it:
  lsof -nP -iTCP:5432 -sTCP:LISTEN

  - Nothing listed -> use 5432. Nothing to change.
  - Something listening (e.g. an SSH tunnel) -> DO NOT point Prisma at it, or
    the seeds will run against whatever remote database that tunnel leads to.
    Either free the port, or move Postgres to 5433:
        brew services stop postgresql@15
        sed -i '' -E 's/^#?port = .*/port = 5433/' /opt/homebrew/var/postgresql@15/postgresql.conf
        brew services start postgresql@15
    and set that port in platform/api/.env.
    (This exact situation happened on the old Mac — it ran on 5433.)

Then create the role and database (use the port you chose):
  createuser -h 127.0.0.1 -p 5432 -s umrah
  createdb   -h 127.0.0.1 -p 5432 umrah_connects -O umrah

────────────────────────────────────────────────────────
STEP 5 — DEPENDENCIES
────────────────────────────────────────────────────────
pnpm install                      # whole workspace; do NOT regenerate the lockfile
cd audit && npm install && cd ..  # playwright-core for the browser proofs

────────────────────────────────────────────────────────
STEP 6 — ENVIRONMENT FILES
────────────────────────────────────────────────────────
cp platform/api/.env.example platform/api/.env
cp apps/web/.env.local.example apps/web/.env.local

These committed templates are COMPLETE and SUFFICIENT for local development.
No real secrets are needed. Adjust DATABASE_URL only if step 4 forced port 5433.

Do NOT change NEXT_PUBLIC_API_URL — it must stay the relative value "/proxy-api",
which is a next.config rewrite keeping web and API same-origin on any host.

There is an optional private handoff folder from the old Mac
(~/Desktop/UMRAH_CONNECT_PRIVATE_MIGRATION/). You do NOT need it: it contains the
same two files with development-only placeholder values, and its API .env points
at the old machine's non-standard port. Ignore it unless I tell you otherwise.
Never paste secrets into chat.

────────────────────────────────────────────────────────
STEP 7 — SCHEMA AND SEED
────────────────────────────────────────────────────────
cd platform/api
npx prisma generate
npx prisma db push        # 13 schemas; there is deliberately NO migrations dir
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-modules.ts
npx ts-node prisma/seed-marketplace.ts
cd ../..

Notes:
 - This project uses prisma db push, NOT prisma migrate. Ignore the db:migrate
   scripts; they are inherited scaffolding.
 - After ANY schema edit: run `prisma db push` AND restart the API dev server.
   The nest watcher caches the old Prisma client and will keep reporting
   "Property 'x' does not exist on type 'PrismaService'" until restarted.

────────────────────────────────────────────────────────
STEP 8 — START BOTH SERVICES
────────────────────────────────────────────────────────
pnpm --filter @umrah-connects/api dev > /tmp/api.log 2>&1 &
pnpm --filter @umrah-connects/web dev > /tmp/web.log 2>&1 &

Wait for readiness rather than sleeping a fixed time:
  API ready = /tmp/api.log contains "running on port" AND
              curl http://localhost:4000/api/v1/health returns 200
  Web ready = curl http://localhost:3000 returns 200

────────────────────────────────────────────────────────
STEP 9 — PROVE IT WORKS (do not skip; do not claim success without output)
────────────────────────────────────────────────────────
9a. Health:
    curl -s http://localhost:4000/api/v1/health
    -> 200 with {"status":"ok", ..., "db":"connected"}

9b. Real login via API (EMAIL-FIRST — do NOT send a tenantId):
    curl -s -X POST http://localhost:4000/api/v1/auth/login \
      -H 'content-type: application/json' \
      -d '{"email":"admin@alharamain.sa","password":"Admin@1234"}'
    -> {"success":true,"data":{"accessToken":...,"refreshToken":...,"expiresIn":900}}

9c. Real browser login: open http://localhost:3000/login, type
    admin@alharamain.sa / Admin@1234 into the Sign In to Workspace tab (there is
    NO tenant field), click Sign in, confirm the operator dashboard shows seeded
    data (pilgrims, hotels, vehicles, revenue), then HARD RELOAD and confirm the
    session survives.

9d. API verification suites. Tenant ids are generated per machine, so discover
    the id — never hardcode one:
      TEN=$(curl -s http://localhost:4000/api/v1/tenants/slug/al-haramain-ksa \
            | python3 -c "import json,sys;print((json.load(sys.stdin).get('data') or {}).get('id'))")
      cd audit
      python3 bp02_supply.py         http://localhost:4000/api/v1 "$TEN"   # expect 24/24
      python3 bp05_social.py         http://localhost:4000/api/v1 "$TEN"   # expect 23/23
      python3 bp06_visa_requests.py  http://localhost:4000/api/v1 "$TEN"   # expect 51/51
      python3 bp08_visa_documents.py http://localhost:4000/api/v1 "$TEN"   # expect 46/46
      python3 bp09_payments.py       http://localhost:4000/api/v1 "$TEN"   # expect 46/46
      python3 bp07_admin.py                                                # expect 55/55

9e. Browser suites — run ONE AT A TIME (running them concurrently, or right
    after deleting .next, can fail on dev-server compile timing rather than a
    real defect):
      node bp02_dash.js      # 9/9
      node bp05_browser.js   # 7/7
      node p5_a11y.js        # 7/7
      node bp06_browser.js   # 29/29
      node bp07_browser.js   # 34/34
      node bp08_browser.js   # 19/19
      node bp09_browser.js   # 13/13

9f. Build gate:
      pnpm --filter @umrah-connects/web exec next build
      pnpm --filter @umrah-connects/api exec nest build
    IMPORTANT: `next build` overwrites .next and breaks a running `next dev`
    (500s, "Cannot find module './<chunk>.js'"). After the build gate:
      rm -rf apps/web/.next && pnpm --filter @umrah-connects/web dev

If anything fails, diagnose and fix the environment before reporting done.

────────────────────────────────────────────────────────
KNOWN STATE — do not treat these as your bugs
────────────────────────────────────────────────────────
 - The live Render API (umrah-connect-api.onrender.com) has been DOWN since
   2026-08-22, returning nothing. Proven not to be a code fault: the exact
   production start path was replayed locally and came up healthy in 2s. It
   needs a human to check the Render dashboard (srv-d94peplckfvc73adlr9g).
   Local development does not depend on it.
 - www.umrahconnect.io has no DNS record; the apex umrahconnect.io works.
 - There is no CI. No .github/ directory exists.
 - Uploads default to local disk (STORAGE_DRIVER=local), which is ephemeral.
   Cloudinary/S3 keys are a pending human item.
 - Payments default to a complete sandbox gateway that moves no real money.
   Stripe keys are a pending human item.
 - Regulator integrations (Nusuk, SISKOPATUH) are PLANNED, not live, and the UI
   must keep saying so. Do not relabel them.

────────────────────────────────────────────────────────
CONVENTIONS TO RESPECT
────────────────────────────────────────────────────────
 - Verification loop: reproduce -> smallest complete fix -> API proof (status
   codes + re-fetch persistence) -> browser proof (real clicks + hard reload) ->
   red-team (bad input must 4xx, never 5xx) -> log to IMPLEMENTATION_LOG.md and
   STATUS.md -> commit. Never claim something works because a page loaded.
 - Status vocabularies live in apps/web/lib/statuses.ts and must mirror the
   Prisma enums. Extend there, not inline.
 - Money is BigInt cents.
 - Never add a second token-refresh path; lib/api.ts has a coalesced singleton.
 - Throw Nest exceptions, never bare Error (bare Error becomes a 500).
 - Guard required ids: findFirst({where:{id: undefined}}) matches the FIRST row.
 - Demo login stays local-only; production uses real auth.
 - Never commit secrets — the repository is PUBLIC.
 - Deploy = push main (auto-deploys Vercel + Render), but ONLY after both
   `next build` and `nest build` pass locally.

────────────────────────────────────────────────────────
FINAL REPORT REQUIRED
────────────────────────────────────────────────────────
Do not end with "setup complete". Report actual evidence:
  - repository cloned to <path>, branch, HEAD SHA
  - installed versions of node, pnpm, postgres
  - which Postgres port was used and why
  - dependencies installed (workspace + audit)
  - database created, schema pushed, three seeds run
  - API health response body
  - web HTTP status
  - real browser login result
  - pass/fail counts for every verification suite you ran
  - both build results
  - localhost URLs
  - any remaining blocker
```
