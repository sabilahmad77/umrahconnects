import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

const prismaWith = (queryRaw: () => Promise<unknown>) => ({ $queryRaw: vi.fn(queryRaw) }) as any;
const up = () => prismaWith(async () => [{ '?column?': 1 }]);
const down = () => prismaWith(async () => Promise.reject(new Error("P1001: Can't reach database server")));

describe('HealthController', () => {
  afterEach(() => {
    delete process.env.UC_RELEASE;
  });

  it('is ready when the database answers', async () => {
    await expect(new HealthController(up()).ready()).resolves.toMatchObject({ status: 'ready' });
  });

  it('answers 503 Service Unavailable, not a 500, when the database is unreachable', async () => {
    const attempt = new HealthController(down()).ready();
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toMatchObject({ status: 503 });
  });

  it('keeps liveness at 200 and reports the database state instead of failing', async () => {
    await expect(new HealthController(up()).health()).resolves.toMatchObject({ status: 'ok', db: 'connected' });
    await expect(new HealthController(down()).health()).resolves.toMatchObject({ status: 'degraded', db: 'unreachable' });
  });

  it('reports the release the image was built from, shortened, or "unknown"', async () => {
    expect((await new HealthController(up()).health()).release).toBe('unknown');
    process.env.UC_RELEASE = '0123456789abcdef0123456789abcdef01234567';
    expect((await new HealthController(up()).health()).release).toBe('0123456789ab');
  });
});
