import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * N-FORM-1 / A12-1 — duplicate submission is prevented by the SERVER.
 *
 * The browser's single-flight only joins identical writes inside ONE tab: A12
 * fired five identical `POST /pilgrims` and got five pilgrims, and reproduced it
 * with two real browser tabs signed in as the same operator. A create that
 * carries an `Idempotency-Key` is now settled once: the first request creates the
 * record and its response is replayed to every duplicate.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

describe('N-FORM-1: identical creates happen once', () => {
  let ctx: TestContext;
  let w: World;

  const post = (a: Actor, path: string, body: Record<string, unknown>, key?: string) => {
    const req = ctx.http().post(api(path)).set(bearer(a));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const ok = async (a: Actor, path: string, body: Record<string, unknown>, key?: string) => {
    const res = await post(a, path, body, key);
    if (res.status >= 300) throw new Error(`${a.email} POST ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  /** Five identical submissions of the same form, at the same moment. */
  const fiveTimes = (a: Actor, path: string, body: Record<string, unknown>, key: string) =>
    Promise.all(Array.from({ length: 5 }, () => post(a, path, body, key)));

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('five identical POST /pilgrims create ONE pilgrim (A12-1 reproduced, then closed)', async () => {
    const passportNumber = `IDEM${uniq()}`;
    const body = { firstName: 'Duplicate', lastName: 'Submission', passportNumber, nationality: 'SA' };
    const responses = await fiveTimes(w.opA, '/pilgrims', body, randomUUID());

    expect(responses.map((r) => r.status)).toEqual(Array(5).fill(201));
    const ids = responses.map((r) => r.body.data.id);
    expect(new Set(ids).size, 'every duplicate answered with the same record').toBe(1);
    // Exactly one duplicate did the work; the rest replayed its answer.
    expect(responses.filter((r) => r.headers['idempotent-replay'] === 'false')).toHaveLength(1);
    expect(await ctx.prisma.pilgrim.count({ where: { tenantId: w.tenants.opA, passportNumber } })).toBe(1);
    // And the answer really is the first one, not a second rendering of it.
    for (const r of responses) expect(r.body).toEqual(responses[0].body);
  });

  it('the same five-at-once submission on three more create routes', async () => {
    // Hotel (an operator's own property record)
    const hotelName = `Idem Hotel ${uniq()}`;
    const hotels = await fiveTimes(w.opA, '/hotels', { name: hotelName, city: 'Makkah', country: 'SA' }, randomUUID());
    expect(hotels.map((r) => r.status)).toEqual(Array(5).fill(201));
    expect(new Set(hotels.map((r) => r.body.data.id)).size).toBe(1);
    expect(await ctx.prisma.hotel.count({ where: { tenantId: w.tenants.opA, name: hotelName } })).toBe(1);

    // Vehicle
    const plateNumber = `IDM-${uniq().slice(0, 6)}`;
    const vehicles = await fiveTimes(w.transportA, '/transport/vehicles', { type: 'BUS', plateNumber, capacity: 40 }, randomUUID());
    expect(vehicles.map((r) => r.status)).toEqual(Array(5).fill(201));
    expect(new Set(vehicles.map((r) => r.body.data.id)).size).toBe(1);
    expect(await ctx.prisma.vehicle.count({ where: { tenantId: w.tenants.transportA, plateNumber } })).toBe(1);

    // Social post (the community feed, where a double click is most visible)
    const content = `Assalamu alaikum from the idempotency test ${uniq()}`;
    const posts = await fiveTimes(w.travelerA, '/social/posts', { content }, randomUUID());
    expect(posts.map((r) => r.status)).toEqual(Array(5).fill(201));
    expect(new Set(posts.map((r) => r.body.data.id)).size).toBe(1);
    expect(await ctx.prisma.post.count({ where: { body: content } })).toBe(1);
  });

  it('a repeat minutes later still replays the first answer; a NEW key creates a second record', async () => {
    const key = randomUUID();
    const body = { firstName: 'Replay', lastName: 'Later', passportNumber: `IDEM${uniq()}`, nationality: 'SA' };
    const first = await ok(w.opA, '/pilgrims', body, key);
    const again = await post(w.opA, '/pilgrims', body, key);
    expect([again.status, again.headers['idempotent-replay']]).toEqual([201, 'true']);
    expect(again.body.data.id).toBe(first.id);

    // A deliberate second submission is a new attempt, and still creates a record.
    const deliberate = await ok(w.opA, '/pilgrims', { ...body, passportNumber: `IDEM${uniq()}` }, randomUUID());
    expect(deliberate.id).not.toBe(first.id);
    expect(await ctx.prisma.pilgrim.count({ where: { tenantId: w.tenants.opA, lastNameEn: 'Later' } })).toBe(2);
  });

  it('the same key with a different body is refused (409), and changes nothing', async () => {
    const key = randomUUID();
    const first = await ok(w.opA, '/pilgrims', { firstName: 'Key', lastName: 'Owner', passportNumber: `IDEM${uniq()}`, nationality: 'SA' }, key);
    const conflict = await post(w.opA, '/pilgrims', { firstName: 'Key', lastName: 'Thief', passportNumber: `IDEM${uniq()}`, nationality: 'SA' }, key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await ctx.prisma.pilgrim.count({ where: { tenantId: w.tenants.opA, lastNameEn: 'Thief' } })).toBe(0);
    expect(await ctx.prisma.pilgrim.findUnique({ where: { id: first.id } })).toBeTruthy();
  });

  it('a key belongs to one user: another operator of the same organization is unaffected', async () => {
    const key = randomUUID();
    const body = { firstName: 'Shared', lastName: 'Key', passportNumber: `IDEM${uniq()}`, nationality: 'SA' };
    const mine = await ok(w.opA, '/pilgrims', body, key);
    const theirs = await ok(w.staffA, '/pilgrims', { ...body, passportNumber: `IDEM${uniq()}` }, key);
    expect(theirs.id).not.toBe(mine.id);
    const rows = await ctx.prisma.idempotencyKey.findMany({ where: { key }, select: { userId: true } });
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([w.opA.id, w.staffA.id]));
  });

  it('a failed create releases the key: the corrected request goes through', async () => {
    const key = randomUUID();
    const refused = await post(w.opA, '/pilgrims', { firstName: 'Bad', lastName: 'Body', notAField: true }, key);
    expect(refused.status).toBe(400);
    expect(await ctx.prisma.idempotencyKey.count({ where: { key } })).toBe(0);
    const fixed = await ok(w.opA, '/pilgrims', { firstName: 'Corrected', lastName: 'Retry', passportNumber: `IDEM${uniq()}`, nationality: 'SA' }, key);
    expect(fixed.id).toBeTruthy();
  });

  it('a replay is not written to the audit trail as a second create', async () => {
    const trail = () => ctx.prisma.auditLog.count({ where: { resource: 'pilgrims', action: 'CREATE', actorId: w.opA.id } });
    const key = randomUUID();
    const body = { firstName: 'Audited', lastName: 'Once', passportNumber: `IDEM${uniq()}`, nationality: 'SA' };
    const before = await trail();
    const created = await ok(w.opA, '/pilgrims', body, key);
    await post(w.opA, '/pilgrims', body, key);
    await post(w.opA, '/pilgrims', body, key);
    // The audit interceptor writes after the response; give it a moment to land.
    await new Promise((r) => setTimeout(r, 400));
    // One create, one audit entry — the two replays created nothing and say nothing.
    expect(await trail()).toBe(before + 1);
    expect(created.id).toBeTruthy();
  });

  it('money keeps its own idempotency: a payment intent is not routed through this table', async () => {
    const before = await ctx.prisma.idempotencyKey.count();
    const key = randomUUID();
    const res = await post(w.travelerA, '/payments/intents', { invoiceId: randomUUID(), amountCents: 100 }, key);
    // Whatever the route answers (the invoice does not exist), the header was ignored.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await ctx.prisma.idempotencyKey.count()).toBe(before);
  });

  it('requests without the header behave exactly as before (five records, as the API always allowed)', async () => {
    const lastName = `NoKey${uniq()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(w.opA, '/pilgrims', { firstName: 'No', lastName, passportNumber: `IDEM${uniq()}`, nationality: 'SA' }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(5).fill(201));
    expect(await ctx.prisma.pilgrim.count({ where: { tenantId: w.tenants.opA, lastNameEn: lastName } })).toBe(5);
  });
});
