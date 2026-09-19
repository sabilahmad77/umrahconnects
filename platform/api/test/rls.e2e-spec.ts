import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Body, Controller, Delete, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { PrismaService } from '../src/prisma/prisma.service';
import { AnyAuthenticated } from '../src/common/decorators/access.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { bindPrincipalToDbContext, runWithDbContext, withSystemScope } from '../src/prisma/db-context';
import { ProtectedTable, RLS_PROTECTED_TABLES, RLS_UNPROTECTED_TABLES } from '../src/prisma/rls-tables';

/**
 * R05 — Row-Level Security as defence in depth.
 *
 * The API under test connects as the non-superuser runtime role (test/db-url.ts),
 * so every query here is subject to the policies. The probe controller below is
 * TEST-ONLY: its routes deliberately omit the service-layer tenant filter, which is
 * exactly the bug RLS must contain.
 */

@Controller('__rls-probe')
class RlsProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('whoami')
  @AnyAuthenticated()
  async whoami() {
    const [row] = await this.prisma.$queryRaw<{ role: string; super: boolean; bypass: boolean; owns: boolean }[]>`
      SELECT r.rolname AS role, r.rolsuper AS super, r.rolbypassrls AS bypass,
             EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid) AS owns
        FROM pg_roles r WHERE r.rolname = current_user`;
    return row;
  }

  @Get('pilgrims')
  @AnyAuthenticated()
  pilgrims() {
    return this.prisma.pilgrim.findMany({ select: { id: true, tenantId: true } }); // no tenant filter (deliberate)
  }

  @Get('pilgrims/raw')
  @AnyAuthenticated()
  pilgrimsRaw() {
    return this.prisma.$queryRaw<{ id: string; tenantId: string }[]>`SELECT id, tenant_id AS "tenantId" FROM plugin_crm.pilgrims`;
  }

  @Get('pilgrims/tx')
  @AnyAuthenticated()
  pilgrimsInTransaction() {
    return this.prisma.$transaction(async (tx) => tx.pilgrim.findMany({ select: { id: true, tenantId: true } }));
  }

  @Get('pilgrims/batch')
  @AnyAuthenticated()
  async pilgrimsInBatch() {
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.pilgrim.findMany({ select: { id: true, tenantId: true } }),
      this.prisma.pilgrim.count(),
    ]);
    return { rows, count };
  }

  @Get('public/pilgrims')
  @Public()
  async publicPilgrims() {
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM plugin_crm.pilgrims`;
    return { count: await this.prisma.pilgrim.count(), raw: rows[0].n };
  }

  @Patch('pilgrims/:id')
  @AnyAuthenticated()
  async updatePilgrim(@Param('id') id: string) {
    const viaPrisma = await this.prisma.pilgrim.updateMany({ where: { id }, data: { notes: 'rls-probe' } });
    const viaRaw = await this.prisma.$executeRaw`UPDATE plugin_crm.pilgrims SET notes = 'rls-probe-raw' WHERE id = ${id}::uuid`;
    return { viaPrisma: viaPrisma.count, viaRaw };
  }

  @Delete('pilgrims/:id')
  @AnyAuthenticated()
  async deletePilgrim(@Param('id') id: string) {
    return { deleted: (await this.prisma.pilgrim.deleteMany({ where: { id } })).count };
  }

  @Post('pilgrims')
  @AnyAuthenticated()
  async createPilgrim(@Body() body: { tenantId: string }) {
    try {
      const p = await this.prisma.pilgrim.create({
        data: {
          tenantId: body.tenantId, firstNameEn: 'Probe', lastNameEn: 'Row', gender: 'MALE',
          dateOfBirth: new Date('1990-01-01'), nationality: 'SA', country: 'SA',
        },
        select: { id: true, tenantId: true },
      });
      return { created: p };
    } catch (e) {
      return { refused: String((e as Error).message).includes('row-level security') };
    }
  }

  @Get('documents')
  @AnyAuthenticated()
  documents() {
    return this.prisma.pilgrimDocument.findMany({ select: { id: true, tenantId: true } });
  }

  @Get('preferences')
  @AnyAuthenticated()
  async preferences() {
    const raw = await this.prisma.$queryRaw<{ userId: string }[]>`SELECT user_id AS "userId" FROM core.user_preferences`;
    return { rows: await this.prisma.userPreference.findMany({ select: { userId: true } }), raw };
  }

  @Patch('kyc/:id')
  @AnyAuthenticated()
  async touchKyc(@Param('id') id: string) {
    return { updated: (await this.prisma.tenantKyc.updateMany({ where: { id }, data: { registryData: { probe: true } } })).count };
  }
}

@Module({ controllers: [RlsProbeController] })
class RlsProbeModule {}

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const byTable = new Map(RLS_PROTECTED_TABLES.map((t) => [t.table, t]));

class Rollback extends Error {}

describe('R05: database-level Row-Level Security', () => {
  let ctx: TestContext;
  let w: World;
  let pA: any;
  let pB: any;

  const call = (a: Actor, method: 'get' | 'post' | 'patch' | 'delete' | 'put', path: string, body?: object) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: 'get' | 'post' | 'patch' | 'delete' | 'put', path: string, body?: object) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  // Test SQL below interpolates only table names from src/prisma/rls-tables.ts and fixture
  // ids the database generated — never request input.
  const ownerCount = async (sql: string): Promise<number> =>
    Number((await ctx.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${Prisma.raw(sql)}`)[0].n);

  /** Runs `fn` against the API's own client in the scope a request of `actor` would have. */
  const asActor = <T>(actor: Actor, platform: boolean, fn: () => Promise<T>) =>
    runWithDbContext({}, async () => {
      bindPrincipalToDbContext(
        { sub: actor.id, tenantId: actor.tenantId, tenantType: platform ? 'PLATFORM' : 'OPERATOR' },
        w.tenants.community,
      );
      return fn();
    });
  const appCount = async (table: string) =>
    Number((await ctx.appPrisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${Prisma.raw(table)}`)[0].n);

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [RlsProbeModule] });
    w = await buildWorld(ctx);

    // Real records in two organizations, created through the API as the owners.
    pA = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Rls', lastName: 'A', passportNumber: `RA${uniq()}` });
    pB = await ok(w.opB, 'post', '/pilgrims', { firstName: 'Rls', lastName: 'B', passportNumber: `RB${uniq()}` });
    const pkgA = await ok(w.opA, 'post', '/packages', { name: `RLS A ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
    const pkgB = await ok(w.opB, 'post', '/packages', { name: `RLS B ${uniq()}`, type: 'UMRAH', priceAdult: 2000 });
    await ok(w.opA, 'post', '/bookings', { packageId: pkgA.id, pilgrimIds: [pA.id] });
    await ok(w.opB, 'post', '/bookings', { packageId: pkgB.id, pilgrimIds: [pB.id] });
    await ok(w.transportA, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `RA-${uniq()}`, capacity: 40 });
    await ok(w.transportB, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `RB-${uniq()}`, capacity: 12 });
    await ok(w.hotelA, 'post', '/hotels', { name: `RLS Hotel A ${uniq()}`, city: 'Makkah', starRating: 4 });
    await ok(w.hotelB, 'post', '/hotels', { name: `RLS Hotel B ${uniq()}`, city: 'Madinah', starRating: 3 });
    for (const a of [w.opA, w.opB, w.travelerA, w.travelerB, w.superAdmin]) {
      await ok(a, 'put', '/users/me/preferences', { notifications: { inApp: { community: false } } });
    }
    // Rows without an API route (or not worth the ceremony here), inserted as the owner.
    const doc = (tenantId: string, pilgrimId: string) => ({
      tenantId, pilgrimId, type: 'PASSPORT', fileName: 'p.pdf', fileUrl: `local://${uniq()}`, mimeType: 'application/pdf', fileSizeBytes: 10,
    });
    await ctx.prisma.pilgrimDocument.createMany({ data: [doc(w.tenants.opA, pA.id), doc(w.tenants.opB, pB.id)] });
    await ctx.prisma.familyGroup.createMany({
      data: [w.tenants.opA, w.tenants.opB, w.tenants.community].map((tenantId) => ({ tenantId, name: `fam ${uniq()}` })),
    });
    await ctx.prisma.hotel.create({ data: { name: `Shared ${uniq()}`, city: 'Makkah', tenantId: null } as any });
    await ctx.prisma.tenantKyc.createMany({
      data: [w.tenants.opA, w.tenants.opB].map((tenantId) => ({ tenantId, registrySource: 'MANUAL', documents: [] }) as any),
    });
  });
  afterAll(async () => ctx?.close());

  // ── the role ──────────────────────────────────────────────────────────────
  it('the API connects as a role that is not a superuser, has no BYPASSRLS and owns no table', async () => {
    const me = await ok(w.opA, 'get', '/__rls-probe/whoami');
    const hint =
      `The API under test connects as "${me.role}", which bypasses Row-Level Security. Create the runtime role ` +
      `(platform/api/prisma/rls/runtime-role.sql) and point .env DATABASE_URL or TEST_APP_DATABASE_URL at it.`;
    expect([me.super, me.bypass, me.owns], hint).toEqual([false, false, false]);
  });

  // ── the catalogue ────────────────────────────────────────────────────────
  describe('every table has a recorded decision, and the database matches it', () => {
    let state: Map<string, { rls: boolean; force: boolean; policies: string[] }>;
    beforeAll(async () => {
      const rows = await ctx.prisma.$queryRaw<{ t: string; rls: boolean; force: boolean; policies: string[] | null }[]>`
        SELECT n.nspname || '.' || c.relname AS t, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
               (SELECT array_agg(p.polname::text ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'public')`;
      state = new Map(rows.map((r) => [r.t, { rls: r.rls, force: r.force, policies: r.policies ?? [] }]));
    });

    it('no table is left unclassified (a new table must be added to src/prisma/rls-tables.ts)', () => {
      const classified = new Set([...byTable.keys(), ...Object.keys(RLS_UNPROTECTED_TABLES)]);
      expect([...state.keys()].filter((t) => !classified.has(t))).toEqual([]);
      expect([...classified].filter((t) => !state.has(t))).toEqual([]);
    });

    it('every table holding tenant-private rows is protected or carries a written reason', async () => {
      const withTenant = await ctx.prisma.$queryRaw<{ t: string }[]>`
        SELECT table_schema || '.' || table_name AS t FROM information_schema.columns
         WHERE column_name = 'tenant_id' AND table_schema NOT IN ('public')`;
      for (const { t } of withTenant) expect(byTable.has(t) || !!RLS_UNPROTECTED_TABLES[t], t).toBe(true);
    });

    it.each(RLS_PROTECTED_TABLES.map((t) => [t.table, t]))('%s: RLS enabled AND forced, with its policies', (table, t) => {
      const s = state.get(table as string)!;
      expect([s.rls, s.force]).toEqual([true, true]);
      const p = t as ProtectedTable;
      const expected = [
        'rls_system',
        ...(p.policy === 'tenant' || p.policy === 'shared-hotel' ? ['rls_tenant'] : []),
        ...(p.policy === 'shared-hotel' ? ['rls_shared_read'] : []),
        ...(p.policy === 'owner-user' ? ['rls_owner'] : []),
        ...(p.policy === 'child' ? ['rls_parent_read', 'rls_parent_write'] : []),
        ...(p.platformRead ? ['rls_platform_read'] : []),
        ...(p.platformWrite ? ['rls_platform_admin'] : []),
      ].sort();
      expect(s.policies).toEqual(expected);
    });

    it('tables recorded as unprotected really are (the document matches the database)', () => {
      for (const t of Object.keys(RLS_UNPROTECTED_TABLES)) expect(state.get(t)?.rls, t).toBe(false);
    });

    it('the audit trail is append-only for the runtime role', async () => {
      const [g] = await ctx.prisma.$queryRaw<{ ins: boolean; upd: boolean; del: boolean }[]>`
        SELECT has_table_privilege('uc_app_runtime', 'audit.audit_logs', 'INSERT') AS ins,
               has_table_privilege('uc_app_runtime', 'audit.audit_logs', 'UPDATE') AS upd,
               has_table_privilege('uc_app_runtime', 'audit.audit_logs', 'DELETE') AS del`;
      expect(g).toEqual({ ins: true, upd: false, del: false });
      await expect(ctx.appPrisma.$executeRaw`DELETE FROM audit.audit_logs WHERE false`).rejects.toThrow(/permission denied/);
    });
  });

  // ── a service that forgets its tenant filter ──────────────────────────────
  describe('an endpoint that omits the tenant filter still cannot cross organizations', () => {
    it('reads (Prisma, raw SQL, interactive and batch transactions) return only the caller\'s rows', async () => {
      expect(await ownerCount(`plugin_crm.pilgrims WHERE tenant_id = '${w.tenants.opB}'`)).toBeGreaterThan(0);
      for (const path of ['/__rls-probe/pilgrims', '/__rls-probe/pilgrims/raw', '/__rls-probe/pilgrims/tx']) {
        const rows: any[] = await ok(w.opA, 'get', path);
        expect(rows.map((r) => r.id), path).toContain(pA.id);
        expect(new Set(rows.map((r) => r.tenantId)), path).toEqual(new Set([w.tenants.opA]));
      }
      const batch = await ok(w.opA, 'get', '/__rls-probe/pilgrims/batch');
      expect(new Set(batch.rows.map((r: any) => r.tenantId))).toEqual(new Set([w.tenants.opA]));
      expect(batch.count).toBe(batch.rows.length);
    });

    it('updates and deletes by a foreign id change nothing; the owner\'s own rows still can', async () => {
      expect(await ok(w.opA, 'patch', `/__rls-probe/pilgrims/${pB.id}`)).toEqual({ viaPrisma: 0, viaRaw: 0 });
      expect(await ok(w.opA, 'delete', `/__rls-probe/pilgrims/${pB.id}`)).toEqual({ deleted: 0 });
      const b = await ctx.prisma.pilgrim.findUniqueOrThrow({ where: { id: pB.id } });
      expect(String(b.notes ?? '')).not.toMatch(/rls-probe/);
      expect(await ok(w.opA, 'patch', `/__rls-probe/pilgrims/${pA.id}`)).toEqual({ viaPrisma: 1, viaRaw: 1 });
    });

    it('rows cannot be written into another organization (WITH CHECK)', async () => {
      expect(await ok(w.opA, 'post', '/__rls-probe/pilgrims', { tenantId: w.tenants.opB })).toEqual({ refused: true });
      const own = await ok(w.opA, 'post', '/__rls-probe/pilgrims', { tenantId: w.tenants.opA });
      expect(own.created.tenantId).toBe(w.tenants.opA);
    });

    it('concurrent requests of two organizations never see each other\'s rows', async () => {
      const actors = Array.from({ length: 24 }, (_, i) => (i % 2 ? w.opA : w.opB));
      const results = await Promise.all(actors.map((a) => ok(a, 'get', '/__rls-probe/pilgrims')));
      results.forEach((rows: any[], i) => {
        expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([actors[i].tenantId]));
      });
    });
  });

  // ── fail closed ──────────────────────────────────────────────────────────
  describe('missing context returns nothing', () => {
    it('a public route sees no tenant-private rows', async () => {
      const res = await ctx.http().get(api('/__rls-probe/public/pilgrims'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 0, raw: 0 });
    });

    it('code outside any request sees no protected rows, but ordinary tables still work', async () => {
      expect(await ownerCount('plugin_crm.pilgrims')).toBeGreaterThan(0);
      expect(await ctx.appPrisma.pilgrim.count()).toBe(0);
      expect(await appCount('plugin_crm.pilgrims')).toBe(0);
      expect(await ctx.appPrisma.userPreference.count()).toBe(0);
      expect(await ctx.appPrisma.tenant.count()).toBeGreaterThan(0);
    });

    it('a pooled connection never carries a scope into the next query', async () => {
      await Promise.all(
        Array.from({ length: 30 }, () => ok(w.opA, 'get', '/__rls-probe/pilgrims/raw')),
      );
      const leftovers = await Promise.all(
        Array.from({ length: 30 }, () =>
          ctx.appPrisma.$queryRaw<{ s: string | null; n: number }[]>`
            SELECT current_setting('app.scope', true) AS s, (SELECT count(*)::int FROM plugin_crm.pilgrims) AS n`,
        ),
      );
      for (const [row] of leftovers) expect([row.s || null, row.n]).toEqual([null, 0]);
    });
  });

  // ── every protected table, every scope ────────────────────────────────────
  describe('each protected table shows exactly the rows its policy allows', () => {
    /** Owner-side SQL for the rows `scope` may see in table `t`. */
    const visibleFilter = (t: ProtectedTable, scope: 'tenant' | 'platform' | 'traveler', tenantId: string, userId: string): string => {
      const alias = t.table.split('.')[1];
      if (t.policy === 'owner-user') return `${t.table} WHERE user_id = '${userId}'`;
      if (t.policy === 'child') {
        const parent = byTable.get(t.parent!.table)!;
        const parentVisible =
          scope === 'platform'
            ? parent.platformRead ? 'true' : parent.policy === 'shared-hotel' ? 'p.tenant_id IS NULL' : 'false'
            : parent.policy === 'shared-hotel'
              ? scope === 'traveler' ? 'p.tenant_id IS NULL' : `(p.tenant_id = '${tenantId}' OR p.tenant_id IS NULL)`
              : scope === 'traveler' ? 'false' : `p.tenant_id = '${tenantId}'`;
        return `${t.table} JOIN ${parent.table} p ON p.id = ${alias}.${t.parent!.column} WHERE ${parentVisible}`;
      }
      if (scope === 'platform') return t.platformRead ? t.table : t.policy === 'shared-hotel' ? `${t.table} WHERE tenant_id IS NULL` : `${t.table} WHERE false`;
      const own = scope === 'traveler' ? 'false' : `tenant_id = '${tenantId}'`;
      return t.policy === 'shared-hotel' ? `${t.table} WHERE ${own} OR tenant_id IS NULL` : `${t.table} WHERE ${own}`;
    };

    it.each(RLS_PROTECTED_TABLES.map((t) => [t.table, t]))('%s', async (_name, t) => {
      const table = t as ProtectedTable;
      const cases: [string, Actor, 'tenant' | 'platform' | 'traveler'][] = [
        ['operator A', w.opA, 'tenant'],
        ['operator B', w.opB, 'tenant'],
        ['hotel A', w.hotelA, 'tenant'],
        ['transport B', w.transportB, 'tenant'],
        ['traveler A', w.travelerA, 'traveler'],
        ['super admin', w.superAdmin, 'platform'],
      ];
      for (const [label, actor, kind] of cases) {
        const expected = await ownerCount(visibleFilter(table, kind, actor.tenantId, actor.id));
        const seen = await asActor(actor, kind === 'platform', () => appCount(table.table));
        expect(seen, `${label} sees ${table.table}`).toBe(expected);
      }
      // Nobody: nothing. System: everything.
      expect(await appCount(table.table)).toBe(0);
      expect(await withSystemScope('test.fixture', () => appCount(table.table))).toBe(await ownerCount(table.table));
    });

    it.each(RLS_PROTECTED_TABLES.map((t) => [t.table, t]))(
      '%s: an UPDATE with no WHERE reaches only the caller\'s rows; a DELETE aimed at foreign rows reaches none (rolled back)',
      async (_name, t) => {
        const table = t as ProtectedTable;
        const alias = table.table.split('.')[1];
        const col = table.policy === 'owner-user' ? 'user_id' : table.policy === 'child' ? table.parent!.column : 'tenant_id';
        for (const actor of [w.opA, w.hotelB, w.travelerA]) {
          const traveler = actor === w.travelerA;
          // Writable = own rows only: shared hotels (and room types of shared hotels) are read-only.
          const writable = await ownerCount(
            table.policy === 'owner-user'
              ? `${table.table} WHERE user_id = '${actor.id}'`
              : traveler
                ? `${table.table} WHERE false`
                : table.policy === 'child'
                  ? `${table.table} JOIN ${table.parent!.table} p ON p.id = ${alias}.${table.parent!.column} WHERE p.tenant_id = '${actor.tenantId}'`
                  : `${table.table} WHERE tenant_id = '${actor.tenantId}'`,
          );
          // Rows this actor must never reach, described WITHOUT relying on RLS.
          const foreign =
            table.policy === 'owner-user'
              ? `user_id <> '${actor.id}'`
              : traveler
                ? 'true'
                : table.policy === 'child'
                  ? `NOT EXISTS (SELECT 1 FROM ${table.parent!.table} p WHERE p.id = ${alias}.${table.parent!.column} AND p.tenant_id = '${actor.tenantId}')`
                  : `tenant_id IS DISTINCT FROM '${actor.tenantId}'`;
          const foreignRows = await ownerCount(`${table.table} WHERE ${foreign}`);
          for (const verb of ['UPDATE', 'DELETE'] as const) {
            // (A DELETE of OWN rows could trip foreign keys, so it targets the foreign rows only.)
            const sql = verb === 'UPDATE' ? `UPDATE ${table.table} SET ${col} = ${col}` : `DELETE FROM ${table.table} WHERE ${foreign}`;
            const expected = verb === 'UPDATE' ? writable : 0;
            let touched = -1;
            await asActor(actor, false, () =>
              ctx.appPrisma
                .$transaction(async (tx) => {
                  touched = await tx.$executeRaw`${Prisma.raw(sql)}`;
                  throw new Rollback();
                })
                .catch((e) => {
                  if (!(e instanceof Rollback)) throw e;
                }),
            );
            expect(touched, `${actor.email}: ${verb} ${alias} (${writable} own, ${foreignRows} foreign rows exist)`).toBe(expected);
          }
        }
      },
    );

    it('moving an own row into another organization is refused (WITH CHECK)', async () => {
      for (const table of RLS_PROTECTED_TABLES.filter((t) => t.policy === 'tenant')) {
        if (!(await ownerCount(`${table.table} WHERE tenant_id = '${w.tenants.opA}'`))) continue;
        await expect(
          asActor(w.opA, false, () =>
            ctx.appPrisma.$transaction(async (tx) => {
              await tx.$executeRaw`UPDATE ${Prisma.raw(table.table)} SET tenant_id = ${w.tenants.opB}::uuid WHERE id = (SELECT id FROM ${Prisma.raw(table.table)} LIMIT 1)`;
              throw new Rollback();
            }),
          ),
          table.table,
        ).rejects.toThrow(/row-level security/);
      }
    });
  });

  // ── platform and system ──────────────────────────────────────────────────
  describe('platform and system scopes', () => {
    it('Super Admin reads every organization\'s oversight tables but cannot change them', async () => {
      const rows: any[] = await ok(w.superAdmin, 'get', '/__rls-probe/pilgrims');
      expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([pA.id, pB.id]));
      expect(await ok(w.superAdmin, 'patch', `/__rls-probe/pilgrims/${pB.id}`)).toEqual({ viaPrisma: 0, viaRaw: 0 });
      expect(await ok(w.superAdmin, 'post', '/__rls-probe/pilgrims', { tenantId: w.tenants.opB })).toEqual({ refused: true });
    });

    it('Super Admin sees no table outside platform oversight (pilgrim documents)', async () => {
      expect(await ownerCount('plugin_crm.pilgrim_documents')).toBeGreaterThan(0);
      expect(await ok(w.superAdmin, 'get', '/__rls-probe/documents')).toEqual([]);
      const own: any[] = await ok(w.opA, 'get', '/__rls-probe/documents');
      expect(own.length).toBeGreaterThan(0);
      expect(new Set(own.map((d) => d.tenantId))).toEqual(new Set([w.tenants.opA]));
    });

    it('KYC review: platform administration may write any organization\'s record; an organization only its own', async () => {
      const kycB = await ctx.prisma.tenantKyc.findFirstOrThrow({ where: { tenantId: w.tenants.opB } });
      const kycA = await ctx.prisma.tenantKyc.findFirstOrThrow({ where: { tenantId: w.tenants.opA } });
      expect(await ok(w.opA, 'patch', `/__rls-probe/kyc/${kycB.id}`)).toEqual({ updated: 0 });
      expect(await ok(w.opA, 'patch', `/__rls-probe/kyc/${kycA.id}`)).toEqual({ updated: 1 });
      expect(await ok(w.superAdmin, 'patch', `/__rls-probe/kyc/${kycB.id}`)).toEqual({ updated: 1 });
    });

    it('system scope is explicit and bounded: everything inside, back to the caller\'s scope after', async () => {
      const total = await ownerCount('plugin_crm.pilgrims');
      await asActor(w.opA, false, async () => {
        const own = await ctx.appPrisma.pilgrim.count();
        expect(own).toBe(await ownerCount(`plugin_crm.pilgrims WHERE tenant_id = '${w.tenants.opA}'`));
        expect(await withSystemScope('test.fixture', () => ctx.appPrisma.pilgrim.count())).toBe(total);
        expect(await ctx.appPrisma.pilgrim.count()).toBe(own);
      });
    });
    it('a transaction keeps the scope it started with: system scope never widens an open tenant transaction', async () => {
      const own = await ownerCount(`plugin_crm.pilgrims WHERE tenant_id = '${w.tenants.opA}'`);
      const total = await ownerCount('plugin_crm.pilgrims');
      await asActor(w.opA, false, () =>
        ctx.appPrisma.$transaction(async (tx) => {
          // The tx handle stays tenant-scoped even inside system scope …
          expect(await withSystemScope('test.fixture', () => tx.pilgrim.count())).toBe(own);
          // … while new operations on the service run system-scoped in their own transaction.
          expect(await withSystemScope('test.fixture', () => ctx.appPrisma.pilgrim.count())).toBe(total);
          expect(await tx.pilgrim.count()).toBe(own);
        }),
      );
    });
  });

  // ── per-user and shared rows ─────────────────────────────────────────────
  describe('per-user rows and the shared traveler community', () => {
    it('a user sees only their own preferences, even with raw SQL', async () => {
      for (const a of [w.travelerA, w.opA, w.superAdmin]) {
        const { rows, raw } = await ok(a, 'get', '/__rls-probe/preferences');
        expect(rows).toEqual([{ userId: a.id }]);
        expect(raw).toEqual([{ userId: a.id }]);
      }
    });

    it('travelers share one organization, yet never match its rows through the tenant clause', async () => {
      expect(await ownerCount(`plugin_crm.family_groups WHERE tenant_id = '${w.tenants.community}'`)).toBeGreaterThan(0);
      expect(await asActor(w.travelerA, false, () => appCount('plugin_crm.family_groups'))).toBe(0);
      expect(await ok(w.travelerA, 'get', '/__rls-probe/pilgrims')).toEqual([]);
    });

    it('shared marketplace hotels are readable by every signed-in scope and writable by none', async () => {
      const shared = await ownerCount('plugin_hotel.hotels WHERE tenant_id IS NULL');
      expect(shared).toBeGreaterThan(0);
      expect(await asActor(w.travelerA, false, () => appCount('plugin_hotel.hotels'))).toBe(shared);
      const touched = await asActor(w.hotelA, false, () =>
        ctx.appPrisma.hotel.updateMany({ where: { tenantId: null }, data: { description: 'rls-probe' } }),
      );
      expect(touched.count).toBe(0);
    });
  });

  // ── a real service-layer gap that RLS contains ─────────────────────────────
  it('the hotel list no longer counts OTHER operators\' allotments on a shared hotel (service-layer _count leak, D-A08-2)', async () => {
    const shared = await ctx.prisma.hotel.create({ data: { name: `Shared allot ${uniq()}`, city: 'Makkah', tenantId: null } as any });
    const allot = { checkIn: '2027-01-10', checkOut: '2027-01-15', totalRooms: 5 };
    await ok(w.opA, 'post', `/hotels/${shared.id}/allotments`, allot);
    await ok(w.opB, 'post', `/hotels/${shared.id}/allotments`, allot);
    await ok(w.opB, 'post', `/hotels/${shared.id}/allotments`, allot);
    expect(await ownerCount(`plugin_hotel.allotments WHERE hotel_id = '${shared.id}'`)).toBe(3);
    const list = await ok(w.opA, 'get', '/hotels?limit=100');
    const row = list.items.find((h: any) => h.id === shared.id);
    // The service counts `allotments` without a tenant filter; RLS confines it to operator A's own.
    expect(row._count.allotments).toBe(1);
  });

  // ── cross-organization flows that must keep working (explicit system scope) ──
  describe('legitimate cross-organization flows run in explicit system scope', () => {
    const offerFlow = async (serviceType: 'TRANSPORT' | 'VISA', provider: Actor) => {
      const request = await ok(w.travelerA, 'post', '/marketplace/requests', {
        serviceType, title: `RLS ${serviceType} ${uniq()}`, travelers: 2, dateFrom: day(30),
      });
      const offer = await ok(provider, 'post', `/marketplace/requests/${request.id}/offers`, { priceCents: 50_000, title: `${serviceType} offer` });
      await ok(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/accept`, {});
      return { request, offer };
    };

    it('a traveler converts an accepted TRANSPORT offer into the provider\'s assignment, with the provider\'s vehicle only', async () => {
      const vA = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `RC-${uniq()}`, capacity: 30 });
      const vB = await ok(w.transportB, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `RD-${uniq()}`, capacity: 30 });
      const { request, offer } = await offerFlow('TRANSPORT', w.transportA);
      const path = `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`;
      expect((await call(w.travelerA, 'post', path, { vehicleId: vB.id })).status).toBe(404);
      const created = await ok(w.travelerA, 'post', path, { vehicleId: vA.id });
      const row = await ctx.prisma.transportAssignment.findUniqueOrThrow({ where: { id: created.id } });
      expect([row.tenantId, row.vehicleId]).toEqual([w.tenants.transportA, vA.id]);
    });

    it('a traveler converts an accepted VISA offer into an application held by the visa provider', async () => {
      const { request, offer } = await offerFlow('VISA', w.visaA);
      const created = await ok(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, {});
      const row = await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.tenantId).toBe(w.tenants.visaA);
    });
  });
});
