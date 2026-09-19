import { describe, expect, it } from 'vitest';
import {
  bindPrincipalToDbContext,
  currentDbContext,
  runInTransactionContext,
  runWithDbContext,
  SystemScoped,
  systemScopeUsage,
  withSystemScope,
} from './db-context';

const TENANT = '11111111-1111-4111-8111-111111111111';
const COMMUNITY = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

describe('database scope context (R05)', () => {
  it('has no scope outside a request', () => {
    expect(currentDbContext()).toBeUndefined();
  });

  it('a request has no scope until the principal is bound (public routes fail closed)', () => {
    runWithDbContext({ requestId: 'r1' }, () => {
      expect(currentDbContext()).toEqual({ requestId: 'r1' });
      expect(currentDbContext()?.scope).toBeUndefined();
    });
  });

  it('binds an ordinary principal to tenant scope with its organization', () => {
    runWithDbContext({}, () => {
      bindPrincipalToDbContext({ sub: USER, tenantId: TENANT, tenantType: 'OPERATOR' }, COMMUNITY);
      expect(currentDbContext()).toMatchObject({ scope: 'tenant', tenantId: TENANT, dbTenantId: TENANT, userId: USER });
    });
  });

  it('binds the platform organization to platform scope', () => {
    runWithDbContext({}, () => {
      bindPrincipalToDbContext({ sub: USER, tenantId: TENANT, tenantType: 'PLATFORM' }, COMMUNITY);
      expect(currentDbContext()?.scope).toBe('platform');
    });
  });

  it('never sends the shared traveler community to the database as a tenant', () => {
    runWithDbContext({}, () => {
      bindPrincipalToDbContext({ sub: USER, tenantId: COMMUNITY, tenantType: 'OPERATOR' }, COMMUNITY);
      expect(currentDbContext()).toMatchObject({ scope: 'tenant', tenantId: COMMUNITY, userId: USER });
      expect(currentDbContext()?.dbTenantId).toBeUndefined();
    });
  });

  it('system scope applies inside the block only, and is counted', async () => {
    const before = systemScopeUsage()['payments.webhook'] ?? 0;
    await runWithDbContext({}, async () => {
      bindPrincipalToDbContext({ sub: USER, tenantId: TENANT, tenantType: 'OPERATOR' }, null);
      const inside = await withSystemScope('payments.webhook', async () => currentDbContext());
      expect(inside).toMatchObject({ scope: 'system', reason: 'payments.webhook', userId: USER });
      expect(currentDbContext()?.scope).toBe('tenant');
    });
    expect(systemScopeUsage()['payments.webhook']).toBe(before + 1);
  });

  it('starts lazy work (Prisma promises) while the scope is still active', async () => {
    // A PrismaPromise runs when .then() is called; withSystemScope must await inside the scope.
    const lazy = { then: (resolve: (v: unknown) => void) => resolve(currentDbContext()?.scope) };
    const seen = await withSystemScope('scripts.maintenance', () => lazy as unknown as Promise<unknown>);
    expect(seen).toBe('system');
  });

  it('refuses unknown reasons', async () => {
    await expect(withSystemScope('anything' as never, async () => 1)).rejects.toThrow(/Unknown system scope reason/);
  });

  it('refuses to switch scope inside an open transaction (its scope is fixed at BEGIN)', async () => {
    await runWithDbContext({}, async () => {
      bindPrincipalToDbContext({ sub: USER, tenantId: TENANT, tenantType: 'OPERATOR' }, null);
      await runInTransactionContext(async () => {
        await expect(withSystemScope('payments.webhook', async () => 1)).rejects.toThrow(/before the transaction/);
      });
      // Already system when the transaction opened: nesting is fine.
      await withSystemScope('payments.webhook', () =>
        runInTransactionContext(() => withSystemScope('payments.webhook', async () => currentDbContext()?.scope)),
      ).then((scope) => expect(scope).toBe('system'));
    });
  });

  it('@SystemScoped wraps a method, keeping `this` and arguments', async () => {
    class Svc {
      factor = 2;
      @SystemScoped('travelers.linked-records')
      async run(n: number) {
        return { scope: currentDbContext()?.scope, value: n * this.factor };
      }
    }
    expect(await new Svc().run(21)).toEqual({ scope: 'system', value: 42 });
    expect(currentDbContext()).toBeUndefined();
  });
});
