import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, World } from './fixtures';

/**
 * F4 — the public inquiry route recognises a signed-in caller. Before: public
 * routes never resolved the principal, so every inquiry was stored as anonymous.
 * Now a valid token attributes the inquiry; a missing or invalid one leaves it
 * anonymous (the route stays public and grants nothing new).
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

describe('F4: inquiries from signed-in users are attributed', () => {
  let ctx: TestContext;
  let w: World;
  let listing: any;

  const inquire = (headers: Record<string, string> = {}, body: Record<string, unknown> = {}) =>
    ctx.http().post(api(`/marketplace/listings/${listing.id}/inquiries`)).set(headers).send({ message: `Is it free? ${uniq()}`, email: 'guest@example.test', ...body });
  const stored = (id: string) => ctx.prisma.listingInquiry.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    const res = await ctx.http().post(api('/marketplace/listings')).set(bearer(w.transportB))
      .send({ title: `Inquiry coach ${uniq()}`, category: 'transport_service', priceFrom: 90 });
    listing = res.body.data;
  });
  afterAll(async () => ctx?.close());

  it('a signed-in traveler is recorded as the author', async () => {
    const res = await inquire(bearer(w.travelerA));
    expect(res.status).toBe(201);
    expect((await stored(res.body.data.id)).fromUserId).toBe(w.travelerA.id);
    // The seller sees who asked.
    const list = await ctx.http().get(api(`/marketplace/listings/${listing.id}/inquiries`)).set(bearer(w.transportB));
    expect(list.body.data.find((i: any) => i.id === res.body.data.id)?.fromUserId).toBe(w.travelerA.id);
  });

  it('anonymous, malformed and forged tokens stay anonymous and are not refused', async () => {
    const forged = `${w.travelerA.token.slice(0, -4)}AAAA`;
    for (const headers of [{}, { Authorization: 'Bearer not-a-jwt' }, { Authorization: `Bearer ${forged}` }, { Authorization: 'Basic abc' }]) {
      const res = await inquire(headers);
      expect(res.status, JSON.stringify(headers)).toBe(201);
      expect((await stored(res.body.data.id)).fromUserId, JSON.stringify(headers)).toBeNull();
    }
  });

  it('nobody can name the author in the body', async () => {
    const res = await inquire({}, { fromUserId: w.travelerB.id });
    expect(res.status).toBe(400);
  });
});
