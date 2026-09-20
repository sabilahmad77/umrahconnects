import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_ROLE_QUERY, DatabaseRoleState } from '../src/modules/health/database-role';
import { REQUIRE_RESTRICTED_DB_ROLE } from '../src/modules/health/health.controller';
import { api, createTestApp, TestContext } from './app';

/**
 * F19 / R05 in production: readiness must fail when the API's database login would bypass Row-Level
 * Security (superuser, BYPASSRLS, table owner). The suite's API connects as the runtime role
 * (test/db-url.ts); the owner URL (a superuser locally) stands in for a misconfigured deployment.
 */

/** An extra app connected with `url`; `production` switches on the production-only readiness rule. */
async function appConnectedAs(url: string, production: boolean): Promise<TestContext> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url; // read by Prisma when the app connects (app.init)
  try {
    return await createTestApp({ overrides: [{ provide: REQUIRE_RESTRICTED_DB_ROLE, useValue: production }] });
  } finally {
    process.env.DATABASE_URL = previous;
  }
}

describe('GET /health/ready — database role check (R05)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('the API under test connects as the restricted runtime role, so RLS applies', async () => {
    const res = await ctx.http().get(api('/health/ready'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', rowLevelSecurity: 'enforced' });
  });

  it('production: ready with the runtime role, 503 DATABASE_ROLE_UNSAFE with the owner/superuser', async () => {
    const runtime = await appConnectedAs(process.env.DATABASE_URL!, true);
    const owner = await appConnectedAs(process.env.TEST_OWNER_DATABASE_URL!, true);
    try {
      const ok = await runtime.http().get(api('/health/ready'));
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'ready', rowLevelSecurity: 'enforced' });

      const unsafe = await owner.http().get(api('/health/ready'));
      expect(unsafe.status).toBe(503);
      expect(unsafe.body.success).toBe(false);
      expect(unsafe.body.error.code).toBe('DATABASE_ROLE_UNSAFE');
      // The public answer names no role and no attribute; the reason goes to the API log.
      expect(JSON.stringify(unsafe.body)).not.toMatch(/superuser|bypassrls|owner/i);

      // Liveness is unaffected: the process is up, it is just not allowed to serve.
      expect((await owner.http().get(api('/health'))).status).toBe(200);
    } finally {
      await runtime.close();
      await owner.close();
    }
  });

  it('outside production a privileged connection stays ready but reports RLS as bypassed', async () => {
    const owner = await appConnectedAs(process.env.TEST_OWNER_DATABASE_URL!, false);
    try {
      const res = await owner.http().get(api('/health/ready'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ready', rowLevelSecurity: 'bypassed' });
    } finally {
      await owner.close();
    }
  });

  it('the role query detects a non-superuser table owner and a BYPASSRLS role (throwaway roles, rolled back)', async () => {
    const suffix = randomBytes(4).toString('hex');
    const probe = async (tx: Prisma.TransactionClient, role: string) => {
      await tx.$executeRaw`SET LOCAL ROLE ${Prisma.raw(role)}`;
      const [state] = await tx.$queryRaw<DatabaseRoleState[]>(DATABASE_ROLE_QUERY);
      await tx.$executeRaw`RESET ROLE`;
      return state;
    };
    const rollback = new Error('rollback');
    const seen: Record<string, DatabaseRoleState> = {};
    await ctx.prisma
      .$transaction(async (tx) => {
        const owner = `uc_probe_owner_${suffix}`;
        const bypass = `uc_probe_bypass_${suffix}`;
        const runtime = `uc_probe_runtime_${suffix}`;
        await tx.$executeRaw`CREATE ROLE ${Prisma.raw(owner)} NOLOGIN NOSUPERUSER NOBYPASSRLS`;
        await tx.$executeRaw`CREATE TABLE public.${Prisma.raw(`uc_probe_${suffix}`)} (id int)`;
        await tx.$executeRaw`ALTER TABLE public.${Prisma.raw(`uc_probe_${suffix}`)} OWNER TO ${Prisma.raw(owner)}`;
        await tx.$executeRaw`CREATE ROLE ${Prisma.raw(bypass)} NOLOGIN NOSUPERUSER BYPASSRLS`;
        await tx.$executeRaw`CREATE ROLE ${Prisma.raw(runtime)} NOLOGIN NOSUPERUSER NOBYPASSRLS IN ROLE uc_app_runtime`;
        seen.owner = await probe(tx, owner);
        seen.bypass = await probe(tx, bypass);
        seen.runtime = await probe(tx, runtime);
        throw rollback; // nothing of this survives: roles, table and ownership are transactional
      })
      .catch((e) => {
        if (e !== rollback) throw e;
      });

    expect(seen.owner).toMatchObject({ superuser: false, bypassRls: false, ownsTables: true, assumesPrivilegedRole: false });
    expect(seen.bypass).toMatchObject({ superuser: false, bypassRls: true, ownsTables: false, assumesPrivilegedRole: false });
    // A member of uc_app_runtime (what the production login is) passes: the group owns nothing.
    expect(seen.runtime).toMatchObject({ superuser: false, bypassRls: false, ownsTables: false, assumesPrivilegedRole: false });
    const left = await ctx.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE ${`uc_probe_%_${suffix}`}`;
    expect(left[0].n).toBe(0);
  });
});
