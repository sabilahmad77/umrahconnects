# 05 — Database and Migrations

No passwords appear in this document. The local development database has none.

## Engine and ORM

| | |
|---|---|
| Engine | PostgreSQL (local: **15**, Homebrew) |
| ORM | **Prisma 5.22** |
| Schema file | `platform/api/prisma/schema.prisma` — the single source of truth |
| Layout | **multiSchema**, 13 PostgreSQL schemas |
| Local database | `umrah_connects`, owner role `umrah` |
| Local connection | `postgresql://umrah@127.0.0.1:5432/umrah_connects` (no password) |

### The 13 schemas

`core`, `marketplace`, `social`, `audit`, `plugin_crm`, `plugin_booking`,
`plugin_hotel`, `plugin_visa`, `plugin_transport`, `plugin_finance`,
`plugin_group_ops`, `plugin_portal`, `plugin_reporting`.

## Migration mechanism — read this first

**There is no `prisma/migrations` directory, and that is deliberate.** The
project uses a **schema-push** workflow.

```bash
cd platform/api
npx prisma generate     # regenerate the client after any schema edit
npx prisma db push      # reconcile the database to schema.prisma
```

Consequences worth internalising:

- `prisma migrate dev` / `migrate deploy` are **not** used here. The
  `db:migrate` scripts in `package.json` are inherited scaffolding — do not run
  them expecting a migrations history.
- Production applies the schema **on container start**. The `Dockerfile` CMD is
  `prisma db push --skip-generate --accept-data-loss && node dist/src/main.js`.
- **A clean database fully reconstructs the schema** — verified during this
  migration by pushing the previous committed schema to a scratch database and
  then pushing the current one over it (clean sync, 147 ms, no data-loss
  warnings).

### The one failure mode to remember

After editing an **enum** in `schema.prisma`, you must actually run
`db push` *and* restart the dev server. A previously observed bug: a new
`NotificationType` value was added to the schema but never pushed, so every
mutation committed its write and then threw on `notification.create` — the API
returned 500 for work that had already succeeded. Two habits prevent it:

1. `npx prisma db push` immediately after any schema change;
2. restart `nest start --watch` after `prisma generate` — the watcher caches the
   old client and will keep reporting `Property 'x' does not exist on type
   'PrismaService'` until it is restarted.

## Seeds

Three scripts, run in this order:

| Order | Script | Creates |
|---|---|---|
| 1 | `prisma/seed.ts` | 3 tenants + admin users (password `Admin@1234`), social feed posts |
| 2 | `prisma/seed-modules.ts` | role/module permissions, 3 hotels, 4 vehicles, 3 drivers, 3 routes, 5 visas, 5 invoices, 3 groups, 1 vendor + 3 listings |
| 3 | `prisma/seed-marketplace.ts` | 4 demo vendors + 6 marketplace listings (idempotent) |

```bash
cd platform/api
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-modules.ts
npx ts-node prisma/seed-marketplace.ts
```

`seed-marketplace.ts` is idempotent and safe to re-run. The other two assume a
fresh database.

## Tenant ids are per-machine

Seeds generate fresh UUIDs on every machine, so tenant ids **differ between the
old Mac, the new Mac and production**. Never hardcode one. Discover it:

```bash
curl -s http://localhost:4000/api/v1/tenants/slug/al-haramain-ksa
```

The `audit/*.py` suites take `API_URL TENANT_ID` as argv precisely for this
reason.

## Local vs remote behaviour

| | Local | Production |
|---|---|---|
| Host | `127.0.0.1` (5432, or 5433 if 5432 is taken) | Managed Postgres, URL set in the Render dashboard |
| Schema applied by | you, via `prisma db push` | container start command |
| Seeded | yes, all three scripts | demo supply seeded once, by hand |
| Safe to reset | yes | **no** |

**Never run destructive verification against production.** Local is for all
destructive testing.

## Useful commands

```bash
psql "postgresql://umrah@127.0.0.1:5432/umrah_connects" -c '\dn'   # list schemas
cd platform/api && pnpm prisma studio                              # browse data
psql "postgresql://umrah@127.0.0.1:5432/umrah_connects" \
  -tAc "select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='NotificationType';"
```

## Reset from scratch

```bash
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
dropdb -h 127.0.0.1 -p 5432 --if-exists umrah_connects
createdb -h 127.0.0.1 -p 5432 umrah_connects -O umrah
cd platform/api && npx prisma db push \
  && npx ts-node prisma/seed.ts \
  && npx ts-node prisma/seed-modules.ts \
  && npx ts-node prisma/seed-marketplace.ts
```
