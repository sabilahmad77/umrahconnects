import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * A10-1 — the traveler side of the marketplace request board was open to every
 * signed-in account: a finance-only user and a platform Super Admin could post
 * a request that providers then see. These routes now need
 * `marketplace:listing:read` — the marketplace capability travelers, operators
 * and providers hold — and a PLATFORM account holds no tenant capability at all
 * (D-005), so platform administration is refused on the business routes.
 */

type Method = 'get' | 'post';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

describe('marketplace requests: who may use the traveler side', () => {
  let ctx: TestContext;
  let w: World;

  const call = (a: Actor | null, method: Method, path: string, body?: Record<string, unknown>) => {
    let req = ctx.http()[method](api(path));
    if (a) req = req.set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const post = (a: Actor | null, path: string, body: Record<string, unknown> = {}) => call(a, 'post', path, body);
  const newRequest = (a: Actor) => post(a, '/marketplace/requests', { serviceType: 'HOTEL', title: `Access ${uniq()}` });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  it('travelers, operators and providers may post a request; finance-only, platform and anonymous callers may not', async () => {
    for (const a of [w.travelerA, w.opA, w.staffA, w.hotelA]) {
      const res = await newRequest(a);
      expect(res.status, `${a.email} ${JSON.stringify(res.body)}`).toBe(201);
    }
    const denied = await newRequest(w.financeA);
    expect([denied.status, denied.body.error.message]).toEqual([403, 'Missing required permissions: marketplace:listing:read']);
    expect((await newRequest(w.superAdmin)).status).toBe(403);
    expect((await call(null, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: 'Anon' })).status).toBe(401);
    // Nothing was written for the refused callers.
    const authors = await ctx.prisma.marketplaceRequest.findMany({ select: { travelerId: true } });
    const ids = authors.map((r) => r.travelerId);
    expect(ids).not.toContain(w.financeA.id);
    expect(ids).not.toContain(w.superAdmin.id);
  });

  it('every caller-scoped request route is closed to accounts without the capability', async () => {
    const own = (await newRequest(w.travelerA)).body.data;
    const offer = (await post(w.hotelA, `/marketplace/requests/${own.id}/offers`, { priceCents: 5_000 })).body.data;
    const routes: [Method, string][] = [
      ['get', '/marketplace/requests/mine'],
      ['get', `/marketplace/requests/${own.id}`],
      ['post', `/marketplace/requests/${own.id}/close`],
      ['post', `/marketplace/requests/${own.id}/offers/${offer.id}/accept`],
      ['post', `/marketplace/requests/${own.id}/offers/${offer.id}/reject`],
      ['post', `/marketplace/requests/${own.id}/offers/${offer.id}/convert-to-booking`],
    ];
    for (const [method, path] of routes) {
      for (const a of [w.financeA, w.superAdmin]) {
        const res = await call(a, method, path, method === 'post' ? {} : undefined);
        expect(res.status, `${a.email} ${method} ${path} ${JSON.stringify(res.body)}`).toBe(403);
      }
      expect((await call(null, method, path, method === 'post' ? {} : undefined)).status, `anon ${path}`).toBe(401);
    }
    // The owner still drives their own request.
    expect((await post(w.travelerA, `/marketplace/requests/${own.id}/offers/${offer.id}/accept`, {})).status).toBe(201);
  });

  it('marketplace bookings by a customer follow the same policy', async () => {
    const listing = (await post(w.hotelA, '/marketplace/listings', { title: `Access room ${uniq()}`, category: 'hotel_room', priceFrom: 100 })).body.data;
    const book = (a: Actor | null) => post(a, `/marketplace/listings/${listing.id}/bookings`, { partySize: 1, customerName: 'Guest' });
    expect((await book(w.travelerA)).status).toBe(201);
    expect((await book(w.financeA)).status).toBe(403);
    expect((await book(w.superAdmin)).status).toBe(403);
    expect((await book(null)).status).toBe(401);
    expect((await call(w.financeA, 'get', '/marketplace/bookings/mine')).status).toBe(403);
  });
});
