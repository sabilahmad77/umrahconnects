import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Stripe webhook verification runs fully offline with a test signing secret.
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_offline_only_never_called';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_offline_test_secret';
});

import Stripe from 'stripe';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
type Method = 'get' | 'post' | 'put' | 'delete';

describe('core follow-ups: approvals, over-collection, offers, drafts, Stripe webhooks', () => {
  let ctx: TestContext;
  let w: World;

  const call = (a: Actor | null, method: Method, path: string, body?: Record<string, unknown>) => {
    let req = ctx.http()[method](api(path));
    if (a) req = req.set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  it('issuing and voiding invoices requires finance:invoice:approve', async () => {
    const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Approval', subtotal: 100, currency: 'SAR' });
    expect((await call(w.staffA, 'put', `/finance/invoices/${inv.id}/issue`)).status).toBe(403);
    expect((await call(w.financeA, 'put', `/finance/invoices/${inv.id}/issue`)).status).toBe(200);
    expect((await call(w.staffA, 'put', `/finance/invoices/${inv.id}/void`)).status).toBe(403);
    const own = await ok(w.hotelA, 'post', '/finance/invoices', { issuedToName: 'Hotel guest', subtotal: 50, currency: 'SAR' });
    expect((await call(w.hotelA, 'put', `/finance/invoices/${own.id}/issue`)).status).toBe(200);
  });

  it('parallel payment attempts cannot collect more than the invoice total', async () => {
    const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Parallel', subtotal: 1000, currency: 'SAR' });
    await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
    const first = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 600 });
    const second = await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 600 });
    expect(second.status).toBe(400);
    const rest = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 400 });
    expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 1 })).status).toBe(400);

    // A stale attempt (outside the reservation window) must still not over-collect at capture time.
    await ctx.prisma.payment.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    const replacement = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 600 });
    expect((await ok(w.opA, 'post', `/payments/intents/${replacement.id}/confirm`, {})).status).toBe('COMPLETED');
    expect((await ok(w.opA, 'post', `/payments/intents/${rest.id}/confirm`, {})).status).toBe('COMPLETED');
    const stale = await call(w.opA, 'post', `/payments/intents/${first.id}/confirm`, {});
    expect(stale.status).toBe(409);
    const row = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect([row.status, Number(row.paidCents)]).toEqual(['PAID', 100_000]);
    expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('FAILED');
  });

  describe('marketplace', () => {
    let vendor: any;

    beforeAll(async () => {
      vendor = await ok(w.hotelA, 'post', '/marketplace/vendors', { name: `Follow-up Hotel ${uniq()}`, type: 'HOTEL', email: 'fu@hotel.test', city: 'Makkah' });
    });

    it('draft and archived listings are not public', async () => {
      const draft = await ctx.prisma.listing.create({
        data: { vendorId: vendor.id, type: 'HOTEL_ROOM' as any, name: `Draft ${uniq()}`, status: 'DRAFT', isActive: true, priceCents: BigInt(1000) } as any,
      });
      expect((await call(null, 'get', `/marketplace/listings/${draft.id}`)).status).toBe(404);
      const list = await call(null, 'get', '/marketplace/listings?includeInactive=true&limit=100');
      expect(JSON.stringify(list.body)).not.toContain(draft.id);
    });

    it('offers cannot be accepted once the request is closed', async () => {
      const req = await ok(w.travelerA, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: `Closed ${uniq()}` });
      const offer = await ok(w.hotelA, 'post', `/marketplace/requests/${req.id}/offers`, { priceCents: 50_000, vendorId: vendor.id });
      await ok(w.travelerA, 'post', `/marketplace/requests/${req.id}/close`, {});
      const accept = await call(w.travelerA, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/accept`, {});
      expect(accept.status).toBe(400);
      expect((await ctx.prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('PENDING');
    });
  });

  describe('Stripe webhooks (offline signature verification)', () => {
    const secret = 'whsec_offline_test_secret';
    const deliver = (event: Record<string, unknown>, signingSecret = secret) => {
      const payload = JSON.stringify(event);
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
      return ctx.http().post(api('/payments/webhook/stripe')).set('Content-Type', 'application/json').set('stripe-signature', header).send(payload);
    };
    const piEvent = (id: string, piId: string, amount: number, livemode = false) => ({
      id, object: 'event', type: 'payment_intent.succeeded', livemode, created: Math.floor(Date.now() / 1000), api_version: '2024-06-20',
      data: { object: { id: piId, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: 'sar' } },
    });
    const stripePayment = async (amountCents: number) => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Stripe', subtotal: amountCents / 100, currency: 'SAR' });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const piId = `pi_${uniq()}`;
      const payment = await ctx.prisma.payment.create({
        data: {
          tenantId: w.tenants.opA, invoiceId: inv.id, amountCents: BigInt(amountCents), currency: 'SAR',
          gateway: 'stripe', gatewayRef: piId, idempotencyKey: `stripe-${uniq()}`, status: 'PENDING',
        },
      });
      return { inv, piId, payment };
    };

    it('rejects a wrong signing secret', async () => {
      const { piId } = await stripePayment(10_000);
      const res = await deliver(piEvent(`evt_${uniq()}`, piId, 10_000), 'whsec_attacker');
      expect(res.status).toBe(400);
    });

    it('ignores events whose live/test mode does not match the configured key', async () => {
      const { piId, payment } = await stripePayment(10_000);
      const res = await deliver(piEvent(`evt_${uniq()}`, piId, 10_000, true));
      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('ignored: livemode mismatch');
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PENDING');
    });

    it('holds a payment whose captured amount differs from the record', async () => {
      const { piId, payment, inv } = await stripePayment(10_000);
      const res = await deliver(piEvent(`evt_${uniq()}`, piId, 1));
      expect(res.status).toBe(200);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('DISPUTED');
      expect(Number((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paidCents)).toBe(0);
    });

    it('settles a matching capture exactly once', async () => {
      const { piId, payment, inv } = await stripePayment(25_000);
      const eventId = `evt_${uniq()}`;
      const first = await deliver(piEvent(eventId, piId, 25_000));
      expect(first.body.data.result).toBe('captured');
      const replay = await deliver(piEvent(eventId, piId, 25_000));
      expect(replay.body.data.duplicate).toBe(true);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('COMPLETED');
      const row = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect([row.status, Number(row.paidCents)]).toEqual(['PAID', 25_000]);
    });
  });
});
