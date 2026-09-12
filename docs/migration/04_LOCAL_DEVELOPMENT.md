# 04 — Local Development from a Fresh Mac

Exact order. Every command was run on the old Mac.

## 1. System prerequisites

```bash
# Homebrew (skip if present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install git gh node@20 postgresql@15
corepack enable && corepack prepare pnpm@9.12.0 --activate
pip3 install --user requests          # for the audit/*.py proof suites
# Google Chrome must be installed — the browser proofs drive the system Chrome
```

If `node@20` is keg-only, put it on PATH:

```bash
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

## 2. Clone

```bash
gh auth status                        # must be logged in as sabilahmad77
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/sabilahmad77/umrahconnects.git umrah-connects
cd umrah-connects
git checkout main
```

## 3. Start PostgreSQL

```bash
brew services start postgresql@15
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
pg_isready -h 127.0.0.1 -p 5432
```

### ⚠️ Port check — read this before assuming 5432

The **old Mac could not use 5432**: an unrelated SSH tunnel was holding
`127.0.0.1:5432`, so local PostgreSQL was moved to **5433** and the old
`platform/api/.env` still points there.

Check the new Mac before choosing:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

- **Nothing listed** → use the standard **5432**. Nothing to change; the
  committed template already uses it.
- **Something is listening** → either free the port, or move PostgreSQL:

  ```bash
  brew services stop postgresql@15
  sed -i '' -E 's/^#?port = .*/port = 5433/' /opt/homebrew/var/postgresql@15/postgresql.conf
  brew services start postgresql@15
  ```

  …and set the port to `5433` in `platform/api/.env`.

This matters: if a tunnel owns 5432 and you point Prisma at it, **seeds run
against whatever remote database the tunnel leads to.**

## 4. Create the role and database

```bash
createuser -h 127.0.0.1 -p 5432 -s umrah
createdb   -h 127.0.0.1 -p 5432 umrah_connects -O umrah
psql "postgresql://umrah@127.0.0.1:5432/umrah_connects" -c "select current_user, current_database();"
```

## 5. Install dependencies

```bash
pnpm install                 # whole workspace
cd audit && npm install && cd ..   # playwright-core, for the browser proofs
```

## 6. Environment files

```bash
cp platform/api/.env.example platform/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Adjust the port in `platform/api/.env` only if step 3 forced 5433.

These templates are **complete and sufficient for local development** — no real
secrets are needed. See the private handoff only if you want to reproduce the
old machine exactly (`docs/migration/07_OLD_MAC_TO_NEW_MAC_CHECKLIST.md`).

## 7. Schema

```bash
cd platform/api
npx prisma generate
npx prisma db push      # creates all 13 schemas; there is no migrations dir
cd ../..
```

## 8. Seed — all three, in this order

```bash
cd platform/api
npx ts-node prisma/seed.ts             # tenants + admin users
npx ts-node prisma/seed-modules.ts     # role/module permissions, hotels, invoices, groups
npx ts-node prisma/seed-marketplace.ts # marketplace vendors + listings
cd ../..
```

## 9. Start the API (port 4000)

```bash
pnpm --filter @umrah-connects/api dev > /tmp/api.log 2>&1 &
curl -s http://localhost:4000/api/v1/health
```

Ready when the log prints `running on port` and health returns
`{"status":"ok", ..., "db":"connected"}`.

## 10. Start the web app (port 3000)

```bash
pnpm --filter @umrah-connects/web dev > /tmp/web.log 2>&1 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000
```

## 11. Mobile (optional)

```bash
pnpm --filter @umrah-connects/mobile start
```

Not at feature parity; not part of the normal local workflow.

## 12. Health checks

```bash
curl -s http://localhost:4000/api/v1/health                       # 200 + db connected
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000    # 200

curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@alharamain.sa","password":"Admin@1234"}'
```

Login is **email-first** — do **not** send a `tenantId`. A successful response
is `{"success":true,"data":{"accessToken":…,"refreshToken":…,"expiresIn":900}}`.

## 13. Expected URLs and accounts

| | |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Swagger | http://localhost:4000/api/docs |
| Health | http://localhost:4000/api/v1/health |

Seeded accounts, password `Admin@1234` for all:

- `admin@alharamain.sa` — KSA operator (primary demo tenant, Al Haramain)
- `admin@baitussalam.co.id` — Indonesian operator
- `admin@kaabatravel.pk` — Pakistani operator

On localhost a **Quick Demo Access** tab offers one-click role logins. It is
hidden on production hosts by `isDemoAllowed()` in `app/(auth)/login/page.tsx`.
**Keep it that way.**

## 14. Verification suites

Tenant ids are generated per machine, so discover, don't hardcode:

```bash
TEN=$(curl -s http://localhost:4000/api/v1/tenants/slug/al-haramain-ksa \
      | python3 -c "import json,sys;print((json.load(sys.stdin).get('data') or {}).get('id'))")

cd audit
python3 bp02_supply.py        http://localhost:4000/api/v1 "$TEN"   # 24/24
python3 bp05_social.py        http://localhost:4000/api/v1 "$TEN"   # 23/23
python3 bp06_visa_requests.py http://localhost:4000/api/v1 "$TEN"   # 51/51
python3 bp08_visa_documents.py http://localhost:4000/api/v1 "$TEN"  # 46/46
python3 bp09_payments.py      http://localhost:4000/api/v1 "$TEN"   # 46/46
python3 bp07_admin.py                                               # 55/55
```

Browser proofs (need Chrome, and both servers running):

```bash
cd audit
node bp02_dash.js      # 9/9
node bp05_browser.js   # 7/7
node p5_a11y.js        # 7/7
node bp06_browser.js   # 29/29
node bp07_browser.js   # 34/34
node bp08_browser.js   # 19/19
node bp09_browser.js   # 13/13
```

Run browser suites one at a time. Run them concurrently, or immediately after
deleting `.next`, and they can fail on dev-server compile timing rather than on
a real defect.
