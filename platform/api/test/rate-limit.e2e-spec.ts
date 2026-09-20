import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Must run before the app module is imported (imports are hoisted, vi.hoisted runs first).
// test/env.ts only defaults THROTTLE_DISABLED when it is undefined, so this value wins.
const previous = vi.hoisted(() => {
  const before = process.env.THROTTLE_DISABLED;
  process.env.THROTTLE_DISABLED = 'false';
  return before;
});

import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, World } from './fixtures';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

describe('red team: rate limiting (throttling enabled)', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    expect(process.env.THROTTLE_DISABLED).toBe('false');
    ctx = await createTestApp();
    w = await buildWorld(ctx); // 13 successful logins from this client
  });
  afterAll(async () => {
    await ctx?.close();
    // Do not leak an enabled throttler into later files that share this worker.
    process.env.THROTTLE_DISABLED = previous ?? 'true';
  });

  it('the 9th wrong password for the same account within 5 minutes is throttled with Retry-After', async () => {
    // A fresh account: the fixture logins already count against the travelers' buckets.
    const email = `bucket.${uniq()}@people.test`;
    const bcrypt = await import('bcryptjs');
    await ctx.prisma.user.create({
      data: {
        tenantId: w.travelerA.tenantId, email, passwordHash: await bcrypt.hash('Bucket-Pass-2026', 4),
        firstName: 'Bucket', lastName: 'Test', status: 'ACTIVE', emailVerifiedAt: new Date(),
      },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await ctx.http().post(api('/auth/login')).send({ email, password: `Wrong-Password-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 401 || s === 423), statuses.join(',')).toBe(true);

    const ninth = await ctx.http().post(api('/auth/login')).send({ email, password: 'Wrong-Password-9' });
    expect(ninth.status).toBe(429);
    const retryAfter = Number(ninth.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(300);
    expect(JSON.stringify(ninth.body)).not.toMatch(/stack|prisma/i);
    // The limiter's own 429 gets the generic message (F5: only throttler exceptions are genericized).
    expect(ninth.body.error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please slow down and try again shortly.',
    });

    // Case / whitespace variations of the same address count against the same bucket.
    const variant = await ctx.http().post(api('/auth/login')).send({ email: `  ${email.toUpperCase()} `, password: 'x' });
    expect(variant.status).toBe(429);
    // Even the right password is refused while the bucket is full.
    const correct = await ctx.http().post(api('/auth/login')).send({ email, password: 'Bucket-Pass-2026' });
    expect(correct.status).toBe(429);

    // Another account from the same client is not blocked by that account's bucket.
    const other = await ctx.http().post(api('/auth/login')).send({ email: w.travelerB.email, password: 'Fixture-Pass-2026' });
    expect(other.status).toBe(200);
  });

  it('registration is throttled after 5 attempts in 10 minutes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await ctx.http().post(api('/auth/register')).send({
        email: `burst.${uniq()}@people.test`, password: 'Burst-Signup-2026', firstName: 'Burst', lastName: String(i),
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 201), statuses.join(',')).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(await ctx.prisma.user.count({ where: { email: { startsWith: 'burst.' } } })).toBe(5);
  });

  it('anonymous public inquiries are throttled after 5 in 10 minutes', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await ctx.http().post(api('/inquiries')).send({ name: 'Spam', email: `spam${i}@example.com`, message: 'hello' });
      codes.push(res.status);
    }
    expect(codes.slice(0, 5).every((c) => c < 400)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it('normal authenticated reads are not throttled', async () => {
    const results = [];
    for (let i = 0; i < 50; i++) {
      results.push((await ctx.http().get(api('/auth/me')).set(bearer(w.opA))).status);
    }
    expect(results.filter((s) => s !== 200)).toEqual([]);
    const burst = await Promise.all(Array.from({ length: 25 }, () => ctx.http().get(api('/pilgrims')).set(bearer(w.opA))));
    expect(burst.map((r) => r.status).filter((s) => s !== 200)).toEqual([]);
  });
});
