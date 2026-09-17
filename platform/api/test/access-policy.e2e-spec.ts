import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestContext } from './app';
import { AccessPolicyCheck } from '../src/modules/rbac/access-policy.check';

describe('access policy inventory', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx?.close());

  it('every route declares a policy and only known capabilities', () => {
    const routes = ctx.app.get(AccessPolicyCheck).inventory();
    expect(routes.length).toBeGreaterThan(250);
    expect(routes.filter((r) => r.policy === 'none')).toEqual([]);
  });

  it('every /admin route requires a platform capability', () => {
    const admin = ctx.app.get(AccessPolicyCheck).inventory().filter((r) => r.path.startsWith('/admin'));
    expect(admin.length).toBeGreaterThan(20);
    for (const r of admin) {
      expect(r.permissions.some((p) => p.startsWith('platform:')), `${r.method} ${r.path}`).toBe(true);
    }
  });
});
