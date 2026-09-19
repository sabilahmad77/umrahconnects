# R05 — Row-Level Security (defence in depth)

Status: implemented on `eng100/a08` (A08). Tenant isolation is still enforced in the
service layer (principal-derived tenant, `src/common/tenant-scope.ts` ownership
helpers, deny-by-default capabilities, cross-tenant e2e attacks). PostgreSQL
Row-Level Security now sits underneath it: a query that forgets its tenant filter
still cannot read or write another organization's rows.

Source of truth for every decision below: `platform/api/src/prisma/rls-tables.ts`.
The migration, the Prisma extension and `test/rls.e2e-spec.ts` all check against it.

## 1. Scope model

Every request gets a database context (AsyncLocalStorage, `src/prisma/db-context.ts`):

| Scope | Who | What PostgreSQL lets it see |
|---|---|---|
| *(none)* | public routes, bootstrap, code outside a request | **no** tenant-private rows (fail closed) |
| `tenant` | every signed-in principal outside the platform organization | its own organization's rows (`tenant_id`), its own per-user rows (`user_id`), shared marketplace hotels (read) |
| `platform` | the PLATFORM organization (Super Admin) | read-only oversight of the tables platform administration reads (pilgrims, packages, bookings, visa applications, invoices, payments, vehicles, hotels, KYC) + write on `core.tenant_kyc` (KYC review) + its own per-user rows. Nothing else. |
| `system` | code that legitimately crosses organizations | everything — entered **only** via `withSystemScope(reason, fn)` / `@SystemScoped(reason)` with a reason from a closed list |

* **Where the context comes from.** `DbContextMiddleware` (registered by `PrismaModule`
  for every route) opens an empty context; `JwtAuthGuard` binds the verified principal
  after authentication (`bindPrincipalToDbContext`). Public routes therefore run with no
  scope unless their code explicitly enters system scope.
* **The traveler community.** Every traveler belongs to the one community organization
  (D-007). Its id is never sent to the database as a tenant (`dbTenantId` is empty for
  community principals), so the tenant clause can never make one traveler's rows visible
  to another; travelers reach tenant-private data only through their own-user rows or an
  explicit system-scoped flow.
* **System scope is audited.** Each entry is logged at debug level with reason, user,
  tenant and request id, and counted (`systemScopeUsage()`). The reasons are a closed
  TypeScript union — adding one is a reviewed code change:

| Reason | Where | Why it must cross organizations | Service-layer guard that stays in force |
|---|---|---|---|
| `payments.traveler-checkout` | `PaymentsService.createCheckout`, `checkoutStatus`, `completeSandboxCheckout` | a traveler pays a provider organization; the payment rows belong to the provider | listing booking pinned to `customerUserId = caller`; payment pinned to `payerUserId = caller`; server-computed amount |
| `payments.webhook` | `PaymentsService.handleWebhook` | a signed provider event (no principal) settles/refunds a payment of any organization | signature verified first; replay/dedupe by (provider, event id); amount checks |
| `travelers.linked-records` | `TravelerLinksService` (`preview`, `accept`, `decline`, `activeLinks`, `listMine`, `unlink`), `TravelerTripsService.tripsFor` | a traveler reads/answers links and trip status held by the operator | token hash + verified email match; every query pinned to an ACTIVE link's organization and pilgrim |
| `notifications.recipient-preferences` | `PreferencesService.allowsInApp` | the sender's request must honour the RECIPIENT's notification settings | reads one boolean for one recipient; returns no data |
| `marketplace.offer-conversion` | `MarketplaceRequestsService.convertOfferToBooking` | the traveler's accepted offer becomes a transport assignment / visa application in the provider organization | request owner = caller; offer accepted; provider tenant from the offer's provider; vehicle/route/listing must belong to that provider |
| `scripts.maintenance` | `prisma/scripts/app-context.ts` (`withAppContext`) | operator CLI scripts (bootstrap admin, QA identities, isolation pairs) | run by an operator on the server only |
| `jobs.maintenance` | reserved for scheduled sweeps (e.g. A06's orphaned-upload cleanup) | a sweep sees every organization | **a job that deletes things because no row references them MUST run in this scope — in any other scope RLS hides the references and everything looks orphaned** |
| `test.fixture` | e2e tests only | arranging/inspecting state through the API's own client | — |

A transaction's scope is fixed when it starts: enter system scope BEFORE `$transaction`.
Inside an open transaction the `tx` handle keeps its original, narrower scope (it is never
widened); new operations on `PrismaService` inside `withSystemScope` run system-scoped in
their own transaction (tested end to end).

## 2. How queries are scoped (`src/prisma/rls-extension.ts`)

`PrismaService` returns a Prisma client extension behind a small proxy:

* **Single operations** that can reach a protected table run as a batch transaction:
  `BEGIN; SELECT set_config('app.scope',$1,true), set_config('app.tenant_id',$2,true),
  set_config('app.user_id',$3,true); <query>; COMMIT`. Values are bound parameters.
  "Can reach" = the model is protected, or the arguments name a relation to a protected
  model anywhere (include/select/where/data/orderBy) or ask for `include: { _count: true }`.
  Other operations run unchanged (no overhead).
* **Interactive `$transaction(async (tx) => …)`**: the settings are applied once at the
  start; `tx` is the unextended client, so nothing inside is re-wrapped.
* **Batch `$transaction([...])`**: the settings statement is prepended.
* **Raw queries** (`$queryRaw`/`$executeRaw`) in a scoped context are always wrapped.
* `set_config(…, true)` is transaction-local: a pooled connection never carries one
  request's scope into the next (tested with 30 concurrent requests + 30 unscoped reads).
* No context ⇒ nothing is set ⇒ `core.rls_scope()` is NULL ⇒ policies return nothing.

## 3. Database (`prisma/migrations/20260918180000_rls_defence_in_depth`)

* Helpers `core.rls_scope()`, `core.rls_tenant_id()`, `core.rls_user_id()` (STABLE SQL;
  `NULLIF(current_setting(…, true), '')` — an ended transaction-local setting reads as
  `''`, which must also mean "no scope").
* Every protected table: `ENABLE` **and** `FORCE ROW LEVEL SECURITY` (the owner is subject
  too; only a superuser/BYPASSRLS role bypasses).
* Policies (permissive, OR-ed):
  * `rls_tenant` — `FOR ALL USING/WITH CHECK (scope = 'tenant' AND tenant_id = app.tenant_id)`
  * `rls_owner` — `FOR ALL … (scope IN ('tenant','platform') AND user_id = app.user_id)`
  * `rls_parent_read` — `FOR SELECT USING (EXISTS parent row visible)`;
    `rls_parent_write` — `FOR ALL … (scope = 'tenant' AND parent.tenant_id = app.tenant_id)`
  * `rls_shared_read` — hotels only: `FOR SELECT USING (tenant_id IS NULL AND scope IS NOT NULL)`
  * `rls_platform_read` — `FOR SELECT USING (scope = 'platform')`
  * `rls_platform_admin` — `tenant_kyc` only: `FOR ALL … (scope = 'platform')`
  * `rls_system` — `FOR ALL … (scope = 'system')`
* The audit trail is **append-only** for the runtime role (`REVOKE UPDATE, DELETE ON
  audit.audit_logs FROM uc_app_runtime`).
* Grants: `uc_app_runtime` (NOLOGIN, NOSUPERUSER, NOBYPASSRLS) gets USAGE on every
  application schema, SELECT/INSERT/UPDATE/DELETE on all tables, sequence usage, and the
  same by default for tables later migrations create (`ALTER DEFAULT PRIVILEGES`).

## 4. Table-by-table policies

### Protected (RLS enabled and forced)

| Table | Policy (rows visible / writable) | Platform scope | Policies |
|---|---|---|---|
| `plugin_crm.pilgrims` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_crm.pilgrim_documents` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_crm.family_groups` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_crm.pilgrim_account_links` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_booking.packages` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_booking.bookings` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_booking.booking_pilgrims` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_visa.visa_applications` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_visa.visa_documents` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_visa.visa_document_versions` | visible when the parent row is visible; writable when the parent belongs to the caller (tenant scope) (`plugin_visa.visa_documents` via `document_id`) | as parent | rls_parent_read, rls_parent_write, rls_system |
| `plugin_visa.regulatory_submissions` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_visa.visa_service_requests` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_visa.visa_service_request_notes` | visible when the parent row is visible; writable when the parent belongs to the caller (tenant scope) (`plugin_visa.visa_service_requests` via `request_id`) | as parent | rls_parent_read, rls_parent_write, rls_system |
| `plugin_visa.visa_service_request_events` | visible when the parent row is visible; writable when the parent belongs to the caller (tenant scope) (`plugin_visa.visa_service_requests` via `request_id`) | as parent | rls_parent_read, rls_parent_write, rls_system |
| `plugin_finance.invoices` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_finance.payments` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_finance.payment_transactions` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_finance.payment_webhook_events` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_finance.payment_customers` | `user_id` = caller (tenant or platform scope) | own rows | rls_owner, rls_system |
| `plugin_finance.budget_plans` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_finance.ledger_entries` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_transport.vehicles` | `tenant_id` = caller organization (tenant scope) | read-only | rls_platform_read, rls_system, rls_tenant |
| `plugin_transport.drivers` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_transport.vehicle_drivers` | visible when the parent row is visible; writable when the parent belongs to the caller (tenant scope) (`plugin_transport.vehicles` via `vehicle_id`) | as parent | rls_parent_read, rls_parent_write, rls_system |
| `plugin_transport.transport_routes` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_transport.transport_assignments` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_transport.tasreeh_permits` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_hotel.hotels` | own organization (tenant scope); shared hotels (`tenant_id IS NULL`) readable by any signed-in scope, written only in system scope | read-only | rls_platform_read, rls_shared_read, rls_system, rls_tenant |
| `plugin_hotel.room_types` | visible when the parent row is visible; writable when the parent belongs to the caller (tenant scope) (`plugin_hotel.hotels` via `hotel_id`) | as parent | rls_parent_read, rls_parent_write, rls_system |
| `plugin_hotel.rooms` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_hotel.hotel_bookings` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_hotel.allotments` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_hotel.room_assignments` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `plugin_group_ops.incidents` | `tenant_id` = caller organization (tenant scope) | none | rls_system, rls_tenant |
| `core.tenant_kyc` | `tenant_id` = caller organization (tenant scope) | read + write (KYC review) | rls_platform_admin, rls_platform_read, rls_system, rls_tenant |
| `core.user_preferences` | `user_id` = caller (tenant or platform scope) | own rows | rls_owner, rls_system |

### Deliberately without RLS (with the reason)

| Table | Why it has no RLS (isolation stays in the service layer) |
|---|---|
| `core.tenants` | Identity substrate: resolved before a principal exists (login, slug lookup, token validation) and listed by platform admin; holds no tenant-private business data. |
| `core.users` | Identity substrate: read on every request by token validation and before a principal exists (login, reset, Google); author/profile names are shown across organizations (social, groups). Secret columns are never serialized (e2e secret scan). |
| `core.refresh_tokens` | Session substrate: looked up by token hash before a principal exists (refresh/logout); never listed. |
| `core.user_identities` | Session substrate: external identities resolved during Google sign-in before a principal exists. |
| `core.otp_codes` | Session substrate: one-time codes verified before a principal exists. |
| `core.roles` | Access-control catalogue: system roles (tenant_id NULL) are shared by every organization and read by the permission guard on every request. |
| `core.permissions` | Access-control catalogue shared by every organization. |
| `core.role_permissions` | Access-control catalogue shared by every organization. |
| `core.user_roles` | Read by the permission guard on every request before any business query; grants are validated in the service layer. |
| `core.tenant_plugins` | Plugin installation flags read by the plugin host; no business data. |
| `core.public_inquiries` | Write-only public contact form; read only by platform administration. |
| `audit.audit_logs` | Append-only trail written from every flow, including pre-authentication ones (login, webhooks) and traveler actions logged against an operator; reads are capability-gated and tenant-filtered. Insert-only RLS needs the writer to stop using INSERT … RETURNING (follow-up). |
| `plugin_finance.fx_rates` | Global reference data (exchange rates); no tenant data. |
| `plugin_group_ops.trip_groups` | Public groups: travelers of the community organization discover and join operator groups; membership decides access (service layer). |
| `plugin_group_ops.group_members` | Membership of shared groups spans organizations (operator staff + community travelers). |
| `plugin_group_ops.group_invites` | Invitations into shared groups span organizations. |
| `plugin_group_ops.group_posts` | Group feed shared by members of different organizations; membership-checked in the service. |
| `plugin_group_ops.group_post_comments` | Group feed shared by members of different organizations. |
| `plugin_group_ops.group_polls` | Group feed shared by members of different organizations. |
| `plugin_group_ops.group_poll_votes` | Group feed shared by members of different organizations. |
| `plugin_group_ops.group_notes` | Group notes shared by members of different organizations. |
| `plugin_group_ops.group_documents` | Group documents shared by members of different organizations; downloads are authorized per member. |
| `marketplace.vendors` | Public marketplace catalogue (published vendors are readable without signing in). |
| `marketplace.listings` | Public marketplace catalogue (published listings are readable without signing in). |
| `marketplace.listing_inquiries` | Two-party record (customer ↔ provider organization); both sides resolved in the service. |
| `marketplace.listing_bookings` | Two-party record (traveler ↔ provider organization); both sides resolved in the service. |
| `marketplace.quotes` | Two-party record (requesting organization ↔ vendor). |
| `marketplace.vendor_ratings` | Published ratings of a vendor are public. |
| `marketplace.marketplace_requests` | Open traveler requests are visible to every provider by design; owner checks in the service. |
| `marketplace.request_offers` | Two-party record (provider offer ↔ traveler request). |
| `social.social_accounts` | Community profile data, per user (no tenant dimension). |
| `social.posts` | Community content, public to signed-in members. |
| `social.comments` | Community content, public to signed-in members. |
| `social.reactions` | Community content, public to signed-in members. |
| `social.saved_posts` | Per-user bookmarks of community content (service-layer owner check). |
| `social.follows` | Community graph, public to signed-in members. |
| `social.connections` | Per-user connection requests (service-layer participant check). |
| `social.conversations` | Direct messages: participant-private, enforced in the service (per-user policy is a follow-up). |
| `social.messages` | Direct messages: participant-private, enforced in the service (per-user policy is a follow-up). |
| `social.post_reports` | Moderation reports, read by platform moderation. |
| `social.notifications` | Per-user inbox written by OTHER users’ actions (fan-out); per-user policy needs a system-scoped writer (follow-up). |

## 5. Roles and setup

| Role | Kind | Used by | RLS |
|---|---|---|---|
| owner (`macbook` locally, `POSTGRES_USER` on KVM) | superuser or BYPASSRLS, owns the schemas | `prisma migrate deploy`, seeds (`prisma/seed*.ts` use a bare PrismaClient), backups/restores | bypasses (required: FORCE RLS would otherwise hide rows from data migrations) |
| `uc_app_runtime` | NOLOGIN group, NOSUPERUSER, NOBYPASSRLS, owns nothing | holds the runtime grants (created by the migration when the migration role may create roles) | subject to every policy |
| login role (`uc_eng100_app` locally, e.g. `uc_app` in production) | LOGIN, member of `uc_app_runtime`, NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE | the API's `DATABASE_URL` | subject to every policy |

**Create / rotate the login role** (after `prisma migrate deploy`, as a superuser, password
from the environment — never on the command line):

```bash
cd platform/api
UC_RUNTIME_LOGIN=uc_app UC_RUNTIME_PASSWORD="$(openssl rand -hex 24)" \
  psql "${MIGRATE_DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f prisma/rls/runtime-role.sql
```

The script is idempotent: it creates `uc_app_runtime` if missing, creates/updates the
login (NOSUPERUSER NOBYPASSRLS …), grants membership, re-applies the grants in the
current database (use it again after a restore), and prints `rolsuper | rolbypassrls |
owns_tables` — all three must be `f`.

**Environment split**

* `DATABASE_URL` → the login role (the API; Prisma Client).
* `MIGRATE_DATABASE_URL` → the owner (migrations and seeds):
  `DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy`,
  `DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm db:seed`.
  CLI scripts under `prisma/scripts/` run in explicit system scope and work with either.
* e2e: the suite resets the `_test` database as the owner (`TEST_DATABASE_URL`) and runs
  the API as the runtime role — `TEST_APP_DATABASE_URL`, or the `.env` `DATABASE_URL`
  credentials applied to the `_test` database (`test/db-url.ts`). Fixtures and
  assertions use an owner connection (`ctx.prisma`); `ctx.appPrisma` is the API's client.
  If the API would connect as a superuser, `test/rls.e2e-spec.ts` fails with setup
  instructions instead of passing without exercising RLS.

Local (this worktree): role `uc_eng100_app`, member of `uc_app_runtime`; `.env`
`DATABASE_URL` uses it, `MIGRATE_DATABASE_URL` keeps `macbook`. Local `pg_hba` is `trust`,
so the password is not what protects the local cluster — the role attributes are.

## 6. Proof

* `test/rls.e2e-spec.ts` (runtime role):
  * the API's connection is not superuser, not BYPASSRLS and owns no table;
  * every table in the database is classified; every protected table has
    `relrowsecurity` and `relforcerowsecurity` and exactly its policies; every table with a
    `tenant_id` column is protected or has a written reason; unprotected tables really have
    RLS off; the audit trail is append-only;
  * a **test-only probe controller that omits the tenant filter**: Prisma reads, raw SQL,
    interactive and batch transactions return only the caller's rows; update/delete by a
    foreign id change nothing (Prisma and raw); inserting into another organization is
    refused (WITH CHECK); 24 concurrent requests from two organizations never mix;
  * fail closed: a public route and code outside a request see no protected rows; a pooled
    connection never carries a scope forward;
  * **every protected table × every scope** (operator A/B, hotel, transport, traveler,
    Super Admin, none, system): the visible row count equals exactly what the policy
    promises (computed independently by the owner), an UPDATE without WHERE reaches only
    the caller's writable rows and a DELETE aimed at foreign rows reaches none (rolled back),
    and moving an own row into another organization is refused;
  * platform: reads oversight tables across organizations, cannot write them, cannot read
    tables outside oversight (pilgrim documents), may write KYC; system scope is bounded, and
    never widens an already open tenant transaction;
  * a real service-layer gap RLS now contains: the hotel list's `_count.allotments` on a
    shared hotel counted other operators' allotments (D-A08-2) — it now counts only the caller's;
  * per-user rows (preferences) even via raw SQL; the shared community; shared hotels;
  * the cross-organization flows keep working in system scope (traveler TRANSPORT/VISA
    offer conversion lands in the provider organization; a foreign vehicle is refused).
* The whole e2e suite runs with the API connected as the runtime role.
* Unit: `src/prisma/db-context.spec.ts`, `src/prisma/rls-extension.spec.ts` (scope
  binding, lazy Prisma promises start inside the scope, no scope switch inside a
  transaction, reach analysis, every Prisma model classified exactly once).

## 7. Performance

Local PostgreSQL 15 (Apple M-series, loopback), dev data, 400 interleaved A/B samples
per query; A = owner connection without RLS or wrapping, B = runtime role through the
scoped client in tenant scope (results verified identical first).
Raw numbers: `docs/control-tower/evidence/eng100/a08/perf-rls-overhead.txt`.

| Query | A p50 | B p50 | Δ p50 |
|---|---|---|---|
| `pilgrim.findMany` (20 rows, tenant filter) | 0.533 ms | 0.838 ms | +0.31 ms |
| `pilgrim.findFirst` by id | 0.517 ms | 0.907 ms | +0.39 ms |
| `booking.findMany` + package + pilgrims | 0.683 ms | 0.986 ms | +0.30 ms |
| `user.findUnique` (unprotected table) | 0.343 ms | 0.351 ms | +0.01 ms |

The cost is the batch transaction's extra round trips (`BEGIN`, one `set_config`
statement, `COMMIT`) — roughly +0.3–0.4 ms per protected query on a local socket, a few
milliseconds for a request that makes ~10 such queries. Policy evaluation is an indexed
equality on `tenant_id` (the STABLE helpers are inlined). Operations that cannot reach a
protected table are not wrapped. If it ever matters, the next step is one scoped
interactive transaction per request (fewer round trips, longer-held connections).

## 8. Known limits (recorded, not hidden)

* **Settings are trusted.** RLS keyed on `app.*` settings trusts the application: SQL
  injection could call `set_config`. Mitigations: Prisma parameterizes everything; the lint
  rule forbids `$queryRawUnsafe`/`$executeRawUnsafe`; the runtime role cannot disable RLS
  (not owner) and is not BYPASSRLS.
* **Foreign keys can point at invisible rows.** RI checks bypass RLS, so a tenant could
  reference another tenant's id in a FK column; the service layer's ownership checks
  (`assertOwnedIfPresent`, `assertAllOwned`) remain the guard. Composite `(tenant_id, id)`
  foreign keys would close this (follow-up).
* **System scope removes the backstop** inside its block; that is why each reason is
  narrow and keeps its explicit checks.
* Tables in the unprotected list keep service-layer isolation only. Candidates for a next
  loop: `social.conversations/messages` (participant policy), `social.notifications`
  (per-user with a system-scoped writer), `audit.audit_logs` (insert-only without
  `RETURNING`), marketplace two-party records.
* Connecting the API as a superuser (the pre-R05 default) silently bypasses everything —
  deployments must use the runtime login (A09 request in the A08 report).
* The extension recognises operations that already run inside a batch transaction through
  Prisma 5's `__internalParams.transaction` (internal API, Prisma pinned at 5.22). The probe
  routes for interactive and batch transactions in `test/rls.e2e-spec.ts` fail if a Prisma
  upgrade changes that.
* Services called directly outside a request (tests, scripts) have no scope: wrap them in
  `withSystemScope('test.fixture' | 'scripts.maintenance', …)` or a request context.

## 9. Adding a table

1. Add it to `src/prisma/rls-tables.ts` — protected (with its policy kind) or unprotected
   (with a reason). The unit and e2e tests fail until you do.
2. For a protected table, add `ENABLE`/`FORCE` + policies in your migration (copy the
   pattern from `20260918180000_rls_defence_in_depth`).
3. If a flow must cross organizations, use `withSystemScope` with an existing reason or
   add a reason (reviewed) — never widen a policy to make a cross-tenant query work.
