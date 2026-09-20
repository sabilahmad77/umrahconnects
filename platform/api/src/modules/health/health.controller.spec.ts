import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseRoleState, databaseRoleProblems } from './database-role';
import { HealthController } from './health.controller';

const restricted: DatabaseRoleState = {
  role: 'uc_app',
  superuser: false,
  bypassRls: false,
  ownsTables: false,
  assumesPrivilegedRole: false,
};
const prismaWith = (queryRaw: () => Promise<unknown>) => ({ $queryRaw: vi.fn(queryRaw) }) as any;
const up = (role: Partial<DatabaseRoleState> = {}) => prismaWith(async () => [{ ...restricted, ...role }]);
const down = () => prismaWith(async () => Promise.reject(new Error("P1001: Can't reach database server")));
const production = (prisma: any) => new HealthController(prisma, true);
const development = (prisma: any) => new HealthController(prisma, false);

describe('HealthController', () => {
  afterEach(() => {
    delete process.env.UC_RELEASE;
  });

  it('is ready when the database answers and the API connects as the restricted runtime role', async () => {
    await expect(production(up()).ready()).resolves.toMatchObject({ status: 'ready', rowLevelSecurity: 'enforced' });
    await expect(development(up()).ready()).resolves.toMatchObject({ status: 'ready', rowLevelSecurity: 'enforced' });
  });

  it('answers 503 Service Unavailable, not a 500, when the database is unreachable', async () => {
    const attempt = production(down()).ready();
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    ['a superuser', { superuser: true, ownsTables: true }],
    ['a BYPASSRLS role', { bypassRls: true }],
    ['the owner of the tables', { ownsTables: true }],
    ['a member of a superuser/BYPASSRLS role', { assumesPrivilegedRole: true }],
  ])('in production answers 503 DATABASE_ROLE_UNSAFE when the API connects as %s (RLS would not apply)', async (_, role) => {
    const attempt = production(up(role)).ready();
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toMatchObject({ status: 503, response: { code: 'DATABASE_ROLE_UNSAFE' } });
  });

  it('outside production stays ready with a privileged role but says RLS is bypassed', async () => {
    await expect(development(up({ superuser: true, ownsTables: true })).ready()).resolves.toMatchObject({
      status: 'ready',
      rowLevelSecurity: 'bypassed',
    });
  });

  it('logs a privileged role once per change, not on every probe', async () => {
    const controller = production(up({ bypassRls: true }));
    const error = vi.spyOn((controller as any).logger, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 3; i++) await controller.ready().catch(() => undefined);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('has BYPASSRLS');
  });

  it('keeps liveness at 200 and reports the database state instead of failing', async () => {
    await expect(production(up()).health()).resolves.toMatchObject({ status: 'ok', db: 'connected' });
    await expect(production(down()).health()).resolves.toMatchObject({ status: 'degraded', db: 'unreachable' });
  });

  it('reports the release the image was built from, shortened, or "unknown"', async () => {
    expect((await production(up()).health()).release).toBe('unknown');
    process.env.UC_RELEASE = '0123456789abcdef0123456789abcdef01234567';
    expect((await production(up()).health()).release).toBe('0123456789ab');
  });
});

describe('databaseRoleProblems', () => {
  it('lists every reason RLS would not bind the role, and nothing for the runtime login', () => {
    expect(databaseRoleProblems(restricted)).toEqual([]);
    expect(
      databaseRoleProblems({ ...restricted, superuser: true, bypassRls: true, ownsTables: true, assumesPrivilegedRole: true }),
    ).toHaveLength(4);
  });
});
